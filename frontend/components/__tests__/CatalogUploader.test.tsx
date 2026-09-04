import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CatalogUploader from "../CatalogUploader";
import * as api from "@/lib/api";
import type { Product } from "@/lib/types";

const demoProducts: Product[] = [
  {
    product_id: "sku-1",
    name: "Mouse",
    price_inr: 500,
    stock: 5,
    category: "electronics",
    description: "x",
    return_policy: "x",
    max_qty_per_order: 5,
  },
  {
    product_id: "sku-2",
    name: "Keyboard",
    price_inr: 900,
    stock: 3,
    category: "electronics",
    description: "x",
    return_policy: "x",
    max_qty_per_order: 5,
  },
];

describe("CatalogUploader", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("shows the parsed-from badge and product count once loaded", async () => {
    vi.spyOn(api, "fetchCatalog").mockResolvedValue(demoProducts);
    render(<CatalogUploader value="catalog_demo_1.csv" onChange={() => {}} />);

    await waitFor(() =>
      expect(screen.getByText(/parsed from \.csv/i)).toBeInTheDocument()
    );
    expect(screen.getByText(/2 products normalized/i)).toBeInTheDocument();
  });

  it("does not show the swap confirmation on the initial load", async () => {
    vi.spyOn(api, "fetchCatalog").mockResolvedValue(demoProducts);
    render(<CatalogUploader value="catalog_demo_1.csv" onChange={() => {}} />);

    await waitFor(() =>
      expect(screen.getByText(/parsed from \.csv/i)).toBeInTheDocument()
    );
    expect(screen.getByText(/catalog swapped/i)).toHaveAttribute(
      "aria-hidden",
      "true"
    );
  });

  it("shows a brief swap confirmation when the catalog file changes", async () => {
    vi.spyOn(api, "fetchCatalog").mockResolvedValue(demoProducts);
    const { rerender } = render(
      <CatalogUploader value="catalog_demo_1.csv" onChange={() => {}} />
    );
    await waitFor(() =>
      expect(screen.getByText(/parsed from \.csv/i)).toBeInTheDocument()
    );

    vi.useFakeTimers({ shouldAdvanceTime: true });
    rerender(
      <CatalogUploader value="catalog_demo_2.json" onChange={() => {}} />
    );

    await waitFor(() =>
      expect(screen.getByText(/catalog swapped/i)).toHaveAttribute(
        "aria-hidden",
        "false"
      )
    );

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    await waitFor(() =>
      expect(screen.getByText(/catalog swapped/i)).toHaveAttribute(
        "aria-hidden",
        "true"
      )
    );
  });
});
