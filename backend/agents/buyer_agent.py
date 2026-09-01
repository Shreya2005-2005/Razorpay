import json
import os
import uuid

from groq import Groq

from core.audit_trail import audit_trail, session_scope
from core.catalog_translator import translate_catalog
from core.checkout import initiate_checkout
from core.negotiation import negotiate
from models.schemas import Product

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_catalog",
            "description": (
                "Search the merchant catalog by keyword against product name, "
                "description, and category. Returns matching products, best matches first."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Keyword(s) to search for"},
                    "max_price_inr": {
                        "type": ["number", "null"],
                        "description": "Optional maximum price filter in INR",
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_product_details",
            "description": "Get full details for a single product by its product_id.",
            "parameters": {
                "type": "object",
                "properties": {"product_id": {"type": "string"}},
                "required": ["product_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "negotiate_with_merchant",
            "description": (
                "Negotiate a price for a product with the merchant agent. Runs a full "
                "back-and-forth exchange internally and returns the settled outcome. "
                "Committing to 2+ units may unlock a better price from the merchant."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "product_id": {"type": "string"},
                    "offer_inr": {
                        "type": "number",
                        "description": "Opening offer price per unit, in INR",
                    },
                    "quantity": {
                        "type": ["integer", "null"],
                        "default": 1,
                        "description": "Number of units the buyer is committing to purchase",
                    },
                },
                "required": ["product_id", "offer_inr"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "checkout",
            "description": (
                "Complete purchase of a product. Checked against policy (spend cap, "
                "category rules, stock, session order limit) before a real payment is "
                "attempted. Pass unit_price_inr if you negotiated a price; otherwise "
                "the product's listed price is charged."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "product_id": {"type": "string"},
                    "quantity": {"type": ["integer", "null"], "default": 1},
                    "unit_price_inr": {
                        "type": ["number", "null"],
                        "description": "Negotiated price per unit, in INR, if applicable",
                    },
                },
                "required": ["product_id"],
            },
        },
    },
]


class BuyerAgent:
    """Shops a catalog on behalf of a user goal, using tool-calling and emitting
    every decision to the audit trail. Checkout is gated by the policy guard and
    settles via a real Razorpay test-mode payment."""

    def __init__(self, goal: str, budget_inr: float, catalog_file: str = "catalog_demo_1.csv"):
        self.session_id = str(uuid.uuid4())
        self.goal = goal
        self.budget_inr = budget_inr
        self.catalog_file = catalog_file
        self.catalog: list[Product] = translate_catalog(catalog_file)
        self.client = Groq(api_key=os.getenv("GROQ_API_KEY"))
        self.model = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
        self.orders_this_session = 0

    def _search_catalog(self, query: str, max_price_inr: float | None = None) -> list[dict]:
        tokens = [t for t in query.lower().split() if t]
        scored: list[tuple[int, Product]] = []
        for product in self.catalog:
            if max_price_inr is not None and product.price_inr > max_price_inr:
                continue
            haystack = f"{product.name} {product.description} {product.category}".lower()
            score = sum(1 for token in tokens if token in haystack)
            if score > 0:
                scored.append((score, product))
        scored.sort(key=lambda pair: (-pair[0], pair[1].price_inr))
        return [product.model_dump() for _, product in scored]

    def _get_product_details(self, product_id: str) -> dict:
        for product in self.catalog:
            if product.product_id == product_id:
                return product.model_dump()
        return {"error": f"No product with id '{product_id}'"}

    def _negotiate_with_merchant(self, product_id: str, offer_inr: float, quantity: int = 1) -> dict:
        product = next((p for p in self.catalog if p.product_id == product_id), None)
        if product is None:
            return {"error": f"No product with id '{product_id}'"}

        result = negotiate(product=product, quantity=quantity, opening_offer_inr=offer_inr)
        return result.model_dump()

    def _checkout(
        self, product_id: str, quantity: int = 1, unit_price_inr: float | None = None
    ) -> dict:
        product = next((p for p in self.catalog if p.product_id == product_id), None)
        if product is None:
            return {"error": f"No product with id '{product_id}'"}

        result = initiate_checkout(
            product=product,
            quantity=quantity,
            orders_this_session=self.orders_this_session,
            unit_price_inr=unit_price_inr,
        )
        if result.get("status") == "awaiting_payment":
            result["note"] = (
                "A real Razorpay test-mode order was created, but completing payment "
                "requires a human in a browser — tell the user to open checkout_url "
                "and pay with a Razorpay test card, then check status_url for the result."
            )
        return result

    def _dispatch_tool(self, name: str, args: dict) -> dict:
        args = {k: v for k, v in args.items() if v is not None}
        if name == "search_catalog":
            return {"results": self._search_catalog(**args)}
        if name == "get_product_details":
            return self._get_product_details(**args)
        if name == "negotiate_with_merchant":
            return self._negotiate_with_merchant(**args)
        if name == "checkout":
            return self._checkout(**args)
        return {"error": f"Unknown tool '{name}'"}

    @staticmethod
    def _tool_result_failure_reason(result: dict) -> str | None:
        """Detects failure across the different tool result shapes, so the run
        loop can flag the *next* tool call as a recovery attempt."""
        if "error" in result:
            return result["error"]
        if result.get("success") is False:
            return result.get("reason") or f"status: {result.get('status')}"
        if result.get("accepted") is False:
            return result.get("reason", "negotiation did not converge")
        if "results" in result and isinstance(result["results"], list) and not result["results"]:
            return "search returned no matching products"
        return None

    def run(self, max_turns: int = 15) -> str:
        with session_scope(self.session_id):
            return self._run(max_turns)

    def _run(self, max_turns: int) -> str:
        system_prompt = (
            "You are a buyer agent shopping a merchant catalog on behalf of a user. "
            f"Goal: {self.goal}\nBudget: ₹{self.budget_inr}\n"
            "Only use information returned by your tools — never invent product ids, "
            "prices, or stock levels. Use search_catalog and get_product_details to find "
            "and verify options before recommending or acting. Stay within budget. "
            "When a tool call fails, don't just give up — respond appropriately to why "
            "it failed: if checkout is blocked by insufficient stock, search for a "
            "similar alternative product (or reduce the quantity) and retry checkout; "
            "if checkout is blocked by policy (spend cap, category, approval threshold), "
            "do not retry the same action — explain the policy reason to the user instead; "
            "if a payment is declined, do not keep retrying the same charge — report the "
            "decline to the user as your final answer; if negotiation fails, you may try "
            "again with an adjusted offer, up to a couple of attempts. Only give up and "
            "report failure after a genuine, sensible attempt to recover. "
            "When you have a final answer for the user, respond in plain text without "
            "calling any more tools."
        )
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": self.goal},
        ]

        audit_trail.emit(
            actor="buyer_agent",
            event_type="decision",
            message=f"Starting session with goal: {self.goal}",
            metadata={"budget_inr": self.budget_inr, "catalog_file": self.catalog_file},
        )

        pending_recovery_from: dict | None = None

        for _ in range(max_turns):
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                tools=TOOLS,
                tool_choice="auto",
                temperature=0,
            )
            message = response.choices[0].message
            messages.append(message.model_dump(exclude_none=True))

            if not message.tool_calls:
                final_message = message.content or ""
                audit_trail.emit(
                    actor="buyer_agent",
                    event_type="decision",
                    message=final_message,
                    metadata={"final": True},
                )
                return final_message

            for tool_call in message.tool_calls:
                name = tool_call.function.name
                try:
                    args = json.loads(tool_call.function.arguments or "{}")
                except json.JSONDecodeError:
                    args = {}

                if pending_recovery_from is not None:
                    audit_trail.emit(
                        actor="buyer_agent",
                        event_type="recovery",
                        message=(
                            f"Recovering from failed '{pending_recovery_from['tool']}' "
                            f"({pending_recovery_from['reason']}) by calling '{name}'"
                        ),
                        metadata={
                            "failed_tool": pending_recovery_from["tool"],
                            "failed_reason": pending_recovery_from["reason"],
                            "retry_tool": name,
                            "retry_arguments": args,
                        },
                    )
                    pending_recovery_from = None
                else:
                    audit_trail.emit(
                        actor="buyer_agent",
                        event_type="decision",
                        message=f"Calling tool '{name}'",
                        metadata={"tool": name, "arguments": args},
                    )

                result = self._dispatch_tool(name, args)

                failure_reason = self._tool_result_failure_reason(result)
                if failure_reason is not None:
                    pending_recovery_from = {"tool": name, "reason": failure_reason}

                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "content": json.dumps(result),
                    }
                )

        audit_trail.emit(
            actor="buyer_agent",
            event_type="failure",
            message="Reached max tool-calling turns without a final answer",
            metadata={"max_turns": max_turns},
        )
        return "I couldn't reach a final decision in time."
