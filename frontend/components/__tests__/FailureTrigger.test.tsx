import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import FailureTrigger from "../FailureTrigger";
import * as api from "@/lib/api";
import type { Product } from "@/lib/types";

const products: Product[] = [
  {
    product_id: "sku-1",
    name: "Wireless Mouse",
    price_inr: 900,
    stock: 10,
    category: "electronics",
    description: "A wireless mouse",
    return_policy: "30-day return",
    max_qty_per_order: 5,
  },
];

describe("FailureTrigger", () => {
  it("lists no armed failures initially", async () => {
    vi.spyOn(api, "fetchArmedFailures").mockResolvedValue({});
    render(<FailureTrigger products={products} />);
    await waitFor(() =>
      expect(screen.getByText(/none armed/i)).toBeInTheDocument()
    );
  });

  it("arms a failure for the selected product and mode", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchArmedFailures").mockResolvedValue({});
    vi.spyOn(api, "armFailure").mockResolvedValue({ "sku-1": "stock_out" });

    render(<FailureTrigger products={products} />);
    await user.click(screen.getByRole("button", { name: /^arm$/i }));

    await waitFor(() =>
      expect(api.armFailure).toHaveBeenCalledWith("sku-1", "stock_out")
    );
    expect(await screen.findByText("sku-1")).toBeInTheDocument();
  });

  it("disarms an armed failure", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "fetchArmedFailures").mockResolvedValue({
      "sku-1": "payment_decline",
    });
    vi.spyOn(api, "disarmFailure").mockResolvedValue({});

    render(<FailureTrigger products={products} />);
    const disarmButton = await screen.findByRole("button", { name: /disarm/i });
    await user.click(disarmButton);

    await waitFor(() =>
      expect(api.disarmFailure).toHaveBeenCalledWith("sku-1")
    );
    await waitFor(() =>
      expect(screen.getByText(/none armed/i)).toBeInTheDocument()
    );
  });

  it("disables the product select and arm button when there are no products", () => {
    vi.spyOn(api, "fetchArmedFailures").mockResolvedValue({});
    render(<FailureTrigger products={[]} />);
    expect(screen.getByText(/no products loaded/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^arm$/i })).toBeDisabled();
  });
});
