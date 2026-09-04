export type AuditActor =
  "buyer_agent" | "merchant_agent" | "policy_guard" | "razorpay" | "system";

export type AuditEventType =
  | "decision"
  | "guardrail_check"
  | "negotiation_turn"
  | "payment_call"
  | "failure"
  | "recovery"
  | "stopped";

export interface AuditEvent {
  timestamp: string;
  actor: AuditActor;
  event_type: AuditEventType;
  message: string;
  metadata: Record<string, unknown>;
  session_id: string;
}

export interface PolicyConfig {
  max_spend_per_order: number;
  max_orders_per_session: number;
  allowed_categories: string[];
  blocked_categories: string[];
  requires_human_approval_above: number;
}

export interface SessionStartRequest {
  goal: string;
  budget_inr: number;
  catalog_file?: string;
}

export interface SessionResult {
  final_message: string;
}

export interface Product {
  product_id: string;
  name: string;
  price_inr: number;
  stock: number;
  category: string;
  description: string;
  return_policy: string;
  max_qty_per_order: number;
}

export type FailureMode = "stock_out" | "payment_decline";
