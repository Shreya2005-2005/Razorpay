import type {
  FailureMode,
  PolicyConfig,
  Product,
  SessionResult,
  SessionStartRequest,
} from "./types";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export async function fetchPolicy(): Promise<PolicyConfig> {
  const res = await fetch(`${API_BASE_URL}/api/policy`);
  if (!res.ok) {
    throw new Error(`Failed to load policy (${res.status})`);
  }
  return res.json();
}

export async function startSession(
  body: SessionStartRequest
): Promise<SessionResult> {
  const res = await fetch(`${API_BASE_URL}/api/session/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Session failed (${res.status}): ${detail}`);
  }
  return res.json();
}

export async function fetchCatalog(catalogFile: string): Promise<Product[]> {
  const res = await fetch(
    `${API_BASE_URL}/api/catalog/${encodeURIComponent(catalogFile)}`
  );
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Failed to load catalog (${res.status}): ${detail}`);
  }
  return res.json();
}

export async function fetchArmedFailures(): Promise<
  Record<string, FailureMode>
> {
  const res = await fetch(`${API_BASE_URL}/api/failure-injector/armed`);
  if (!res.ok) {
    throw new Error(`Failed to load armed failures (${res.status})`);
  }
  return res.json();
}

export async function armFailure(
  productId: string,
  mode: FailureMode
): Promise<Record<string, FailureMode>> {
  const res = await fetch(`${API_BASE_URL}/api/failure-injector/arm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ product_id: productId, mode }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Failed to arm failure (${res.status}): ${detail}`);
  }
  const data = await res.json();
  return data.armed;
}

export async function disarmFailure(
  productId: string
): Promise<Record<string, FailureMode>> {
  const res = await fetch(
    `${API_BASE_URL}/api/failure-injector/disarm?product_id=${encodeURIComponent(productId)}`,
    { method: "POST" }
  );
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Failed to disarm failure (${res.status}): ${detail}`);
  }
  const data = await res.json();
  return data.armed;
}
