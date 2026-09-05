import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PolicyDashboard from "../PolicyDashboard";
import * as api from "@/lib/api";
import type { PolicyConfig } from "@/lib/types";

const samplePolicy: PolicyConfig = {
  max_spend_per_order: 1500,
  max_orders_per_session: 1,
  allowed_categories: ["gifts", "home", "electronics"],
  blocked_categories: ["alcohol", "weapons"],
  requires_human_approval_above: 1000,
};

describe("PolicyDashboard", () => {
  it("shows a loading state before the policy resolves", () => {
    vi.spyOn(api, "fetchPolicy").mockReturnValue(new Promise(() => {}));
    render(<PolicyDashboard />);
    expect(screen.getByText(/loading policy/i)).toBeInTheDocument();
  });

  it("renders the policy once loaded", async () => {
    vi.spyOn(api, "fetchPolicy").mockResolvedValue(samplePolicy);
    render(<PolicyDashboard />);

    await waitFor(() =>
      expect(screen.getByText("₹1500.00")).toBeInTheDocument()
    );
    expect(screen.getByText("gifts")).toBeInTheDocument();
    expect(screen.getByText("alcohol")).toBeInTheDocument();
  });

  it("renders an error message when the policy fails to load", async () => {
    vi.spyOn(api, "fetchPolicy").mockRejectedValue(
      new Error("Failed to load policy (500)")
    );
    render(<PolicyDashboard />);

    await waitFor(() =>
      expect(
        screen.getByText(/failed to load policy \(500\)/i)
      ).toBeInTheDocument()
    );
  });

  describe("buyer variant", () => {
    it("shows only a plain-language approval-threshold note", async () => {
      vi.spyOn(api, "fetchPolicy").mockResolvedValue(samplePolicy);
      render(<PolicyDashboard variant="buyer" />);

      await waitFor(() =>
        expect(
          screen.getByText(/orders above ₹1000\.00 may need manual approval/i)
        ).toBeInTheDocument()
      );
      expect(screen.queryByText(/max spend/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/max orders/i)).not.toBeInTheDocument();
      expect(screen.queryByText("gifts")).not.toBeInTheDocument();
      expect(screen.queryByText("alcohol")).not.toBeInTheDocument();
    });
  });
});
