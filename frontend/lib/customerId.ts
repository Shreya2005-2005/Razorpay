// A lightweight, client-generated customer identity — stored in
// localStorage so a returning visit is recognized as the same customer by
// core.loyalty, without needing a real account system (see the Phase 8
// roadmap for that). Not a security boundary: anyone can clear storage or
// edit it and start over as a "new" customer — fine for a demo loyalty
// feature, not something a real rewards program could rely on.

const STORAGE_KEY = "acx_customer_id";

function generateId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `cust-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getOrCreateCustomerId(): string {
  if (typeof window === "undefined") return "";
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const id = generateId();
    window.localStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    // Storage unavailable (private browsing, quota) — fall back to a
    // per-call id rather than crashing; loyalty just won't persist.
    return generateId();
  }
}
