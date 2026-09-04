import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { armFailure, fetchPolicy, startSession } from "../api";

function mockFetchOnce(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

describe("lib/api", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetchPolicy resolves with the parsed policy on success", async () => {
    const policy = { max_spend_per_order: 1500 };
    vi.stubGlobal("fetch", mockFetchOnce(200, policy));

    await expect(fetchPolicy()).resolves.toEqual(policy);
  });

  it("fetchPolicy throws with the status code on failure", async () => {
    vi.stubGlobal("fetch", mockFetchOnce(500, {}));

    await expect(fetchPolicy()).rejects.toThrow(/500/);
  });

  it("startSession posts the goal/budget/catalog_file body", async () => {
    const fetchMock = mockFetchOnce(200, { final_message: "done" });
    vi.stubGlobal("fetch", fetchMock);

    await startSession({
      goal: "Buy a gift",
      budget_inr: 500,
      catalog_file: "catalog_demo_1.csv",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/session/start"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          goal: "Buy a gift",
          budget_inr: 500,
          catalog_file: "catalog_demo_1.csv",
        }),
      })
    );
  });

  it("armFailure returns the armed map from the response body", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchOnce(200, { armed: { "sku-1": "stock_out" } })
    );

    await expect(armFailure("sku-1", "stock_out")).resolves.toEqual({
      "sku-1": "stock_out",
    });
  });
});
