import { afterEach, describe, expect, it } from "vitest";
import { getOrCreateCustomerId } from "../customerId";

describe("getOrCreateCustomerId", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("generates and persists an id on first call", () => {
    const id = getOrCreateCustomerId();
    expect(id).toBeTruthy();
    expect(window.localStorage.getItem("acx_customer_id")).toBe(id);
  });

  it("returns the same id on subsequent calls", () => {
    const first = getOrCreateCustomerId();
    const second = getOrCreateCustomerId();
    expect(second).toBe(first);
  });

  it("generates a different id for a different stored value", () => {
    const first = getOrCreateCustomerId();
    window.localStorage.clear();
    const second = getOrCreateCustomerId();
    expect(second).not.toBe(first);
  });
});
