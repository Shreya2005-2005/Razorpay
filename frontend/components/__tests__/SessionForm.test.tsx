import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import SessionForm from "../SessionForm";
import * as api from "@/lib/api";

describe("SessionForm", () => {
  it("shows the catalog file it will shop", () => {
    render(<SessionForm catalogFile="catalog_demo_1.csv" />);
    expect(screen.getByText("catalog_demo_1.csv")).toBeInTheDocument();
  });

  it("disables submit and shows a running message while the session is in flight", async () => {
    const user = userEvent.setup();
    let resolveSession: (value: { final_message: string }) => void = () => {};
    vi.spyOn(api, "startSession").mockReturnValue(
      new Promise((resolve) => {
        resolveSession = resolve;
      })
    );

    render(<SessionForm catalogFile="catalog_demo_1.csv" />);
    await user.type(screen.getByLabelText("Goal"), "Buy a gift under ₹500");
    await user.click(
      screen.getByRole("button", { name: /start buyer agent/i })
    );

    expect(screen.getByRole("button", { name: /running/i })).toBeDisabled();
    expect(screen.getByText(/watch the audit trail/i)).toBeInTheDocument();

    resolveSession({ final_message: "Bought a candle for ₹450." });
    await waitFor(() =>
      expect(screen.getByText(/bought a candle/i)).toBeInTheDocument()
    );
  });

  it("renders the failure reason when the session call rejects", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "startSession").mockRejectedValue(
      new Error("Session failed (400): bad catalog")
    );

    render(<SessionForm catalogFile="catalog_demo_1.csv" />);
    await user.type(screen.getByLabelText("Goal"), "Buy anything");
    await user.click(
      screen.getByRole("button", { name: /start buyer agent/i })
    );

    await waitFor(() =>
      expect(
        screen.getByText(/session failed \(400\): bad catalog/i)
      ).toBeInTheDocument()
    );
  });

  it("does not submit an empty goal", async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(api, "startSession");

    render(<SessionForm catalogFile="catalog_demo_1.csv" />);
    await user.click(
      screen.getByRole("button", { name: /start buyer agent/i })
    );

    expect(spy).not.toHaveBeenCalled();
  });
});
