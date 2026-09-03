# Agent Commerce Adapter

**Making merchants shoppable by AI buyers safely, explainably, and for real.**

🔗 **Live demo:** [frontend-taupe-alpha-10.vercel.app](https://frontend-taupe-alpha-10.vercel.app)
🔗 **API docs:** [razorpay-gydf.onrender.com/docs](https://razorpay-gydf.onrender.com/docs)

---

## The story

Right now, when you shop online, *you* click every button — search, compare, add to cart, pay. But a new kind of shopper is showing up: AI agents that do this on your behalf. You tell an assistant "buy me a birthday gift under ₹1500," and it goes and actually does it — no clicking required.

The problem is, most online shops are built for humans to *look at*, not for AI to *understand and safely transact with*. There's no common way for an AI buyer to read a shop's catalog, know what it's allowed to spend, or prove afterward that it acted responsibly.

**Agent Commerce Adapter** is a working answer to that problem — built for Razorpay's Buildathon (Track 1: AI Growth & Agentic Commerce).

## What it actually does

1. **Understands any shop's catalog**  feed it a CSV or JSON product list with any column names, and it normalizes it into one clean format any AI can read. Proven to work across three totally different-looking source files.
2. **Keeps every purchase bounded**  a policy guard checks spending limits, allowed categories, and approval thresholds before any money moves.
3. **Runs a real negotiation**  a Buyer Agent (powered by an LLM, with a goal and a budget) haggles with a Merchant Agent (deterministic pricing rules) over price, back and forth, until they settle.
4. **Pays for real**  completes an actual Razorpay test-mode payment, with the outcome independently re-verified against Razorpay's own API, never just trusted from the browser.
5. **Shows its work, live**  every decision, guardrail check, negotiation round, and payment call streams to a live audit trail. Nothing the AI does is a black box.
6. **Fails gracefully**  a built-in failure injector can simulate a stock-out or a declined payment on demand, and the Buyer Agent recovers intelligently instead of breaking.

## Try it yourself

Open the [live demo](https://frontend-taupe-alpha-10.vercel.app), pick a catalog, give the Buyer Agent a goal like *"Find a gift under ₹700 and recommend the best one,"* and watch the Audit Trail fill in live as it searches, checks policy, negotiates, and (if you ask it to) pays.

## Tech stack

**Backend:** Python, FastAPI, Groq (LLM tool-calling), Razorpay SDK (test-mode Orders + Payments API), Server-Sent Events for live streaming, deployed on Render.

**Frontend:** Next.js, React, TypeScript, Tailwind CSS, deployed on Vercel.

## Why the Merchant Agent isn't an LLM

Deliberately. A merchant's pricing needs to be predictable and auditable — not creative. The Buyer Agent reasons and adapts using an LLM; the Merchant Agent applies fixed, transparent pricing rules (bulk discounts, category promotions, a hard cost floor). That split is what makes the whole system "bounded and explainable," not just a slogan.

---
