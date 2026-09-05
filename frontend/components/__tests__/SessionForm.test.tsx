import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import SessionForm from "../SessionForm";
import * as api from "@/lib/api";

const mockUseAuditTrail = vi.fn();

vi.mock("@/hooks/useAuditTrail", () => ({
  useAuditTrail: () => mockUseAuditTrail(),
  SESSION_START_PREFIX: "Starting session with goal: ",
}));

function setAuditTrail(
  overrides: {
    activeSessionId?: string | null;
    isLive?: boolean;
    events?: import("@/lib/types").AuditEvent[];
  } = {}
) {
  mockUseAuditTrail.mockReturnValue({
    activeSessionId: null,
    isLive: true,
    events: [],
    ...overrides,
  });
}

describe("SessionForm", () => {
  it("shows the catalog file it will shop", () => {
    setAuditTrail();
    render(<SessionForm catalogFile="catalog_demo_1.csv" />);
    expect(screen.getByText("catalog_demo_1.csv")).toBeInTheDocument();
  });

  it("disables submit and shows a running message while the session is in flight", async () => {
    setAuditTrail();
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
    setAuditTrail();
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
    setAuditTrail();
    const user = userEvent.setup();
    const spy = vi.spyOn(api, "startSession");

    render(<SessionForm catalogFile="catalog_demo_1.csv" />);
    await user.click(
      screen.getByRole("button", { name: /start buyer agent/i })
    );

    expect(spy).not.toHaveBeenCalled();
  });

  it("does not show Stop Agent before a session id is known", async () => {
    setAuditTrail({ activeSessionId: null, isLive: true });
    const user = userEvent.setup();
    vi.spyOn(api, "startSession").mockReturnValue(new Promise(() => {}));

    render(<SessionForm catalogFile="catalog_demo_1.csv" />);
    await user.type(screen.getByLabelText("Goal"), "Buy anything");
    await user.click(
      screen.getByRole("button", { name: /start buyer agent/i })
    );

    expect(
      screen.queryByRole("button", { name: /stop agent/i })
    ).not.toBeInTheDocument();
  });

  it("shows Stop Agent once running with a known session id, and calls stopSession on click", async () => {
    setAuditTrail({ activeSessionId: "session-1", isLive: true });
    const user = userEvent.setup();
    vi.spyOn(api, "startSession").mockReturnValue(new Promise(() => {}));
    const stopSpy = vi.spyOn(api, "stopSession").mockResolvedValue(undefined);

    render(<SessionForm catalogFile="catalog_demo_1.csv" />);
    await user.type(screen.getByLabelText("Goal"), "Buy anything");
    await user.click(
      screen.getByRole("button", { name: /start buyer agent/i })
    );

    const stopButton = screen.getByRole("button", { name: /stop agent/i });
    await user.click(stopButton);

    expect(stopSpy).toHaveBeenCalledWith("session-1");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /stopping/i })).toBeDisabled()
    );
    expect(
      screen.getByText(/agent will halt before its next action/i)
    ).toBeInTheDocument();
  });

  it("shows an error if stopping fails, and re-enables the button", async () => {
    setAuditTrail({ activeSessionId: "session-1", isLive: true });
    const user = userEvent.setup();
    vi.spyOn(api, "startSession").mockReturnValue(new Promise(() => {}));
    vi.spyOn(api, "stopSession").mockRejectedValue(
      new Error("Failed to stop session (500): boom")
    );

    render(<SessionForm catalogFile="catalog_demo_1.csv" />);
    await user.type(screen.getByLabelText("Goal"), "Buy anything");
    await user.click(
      screen.getByRole("button", { name: /start buyer agent/i })
    );
    await user.click(screen.getByRole("button", { name: /stop agent/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/failed to stop session \(500\): boom/i)
      ).toBeInTheDocument()
    );
    expect(
      screen.getByRole("button", { name: /^stop agent$/i })
    ).not.toBeDisabled();
  });

  it("does not show Stop Agent while viewing a past (non-live) session", async () => {
    setAuditTrail({ activeSessionId: "session-1", isLive: false });
    const user = userEvent.setup();
    vi.spyOn(api, "startSession").mockReturnValue(new Promise(() => {}));

    render(<SessionForm catalogFile="catalog_demo_1.csv" />);
    await user.type(screen.getByLabelText("Goal"), "Buy anything");
    await user.click(
      screen.getByRole("button", { name: /start buyer agent/i })
    );

    expect(
      screen.queryByRole("button", { name: /stop agent/i })
    ).not.toBeInTheDocument();
  });

  it("shows the completed-in duration badge once the session's audit events include start and end timestamps", async () => {
    setAuditTrail({
      events: [
        {
          timestamp: "2026-01-01T00:00:00.000Z",
          actor: "buyer_agent",
          event_type: "decision",
          message: "Starting session with goal: Buy anything",
          metadata: {},
          session_id: "session-1",
        },
        {
          timestamp: "2026-01-01T00:00:14.000Z",
          actor: "buyer_agent",
          event_type: "decision",
          message: "Bought it.",
          metadata: { final: true },
          session_id: "session-1",
        },
      ],
    });
    const user = userEvent.setup();
    vi.spyOn(api, "startSession").mockResolvedValue({
      final_message: "Bought it.",
    });

    render(<SessionForm catalogFile="catalog_demo_1.csv" />);
    await user.type(screen.getByLabelText("Goal"), "Buy anything");
    await user.click(
      screen.getByRole("button", { name: /start buyer agent/i })
    );

    await waitFor(() =>
      expect(screen.getByText(/completed in 14 seconds/i)).toBeInTheDocument()
    );
  });

  it("includes a customer_id in the session start request", async () => {
    setAuditTrail();
    const user = userEvent.setup();
    const startSpy = vi
      .spyOn(api, "startSession")
      .mockResolvedValue({ final_message: "Done." });

    render(<SessionForm catalogFile="catalog_demo_1.csv" />);
    await user.type(screen.getByLabelText("Goal"), "Buy anything");
    await user.click(
      screen.getByRole("button", { name: /start buyer agent/i })
    );

    await waitFor(() => expect(startSpy).toHaveBeenCalled());
    const requestBody = startSpy.mock.calls[0][0];
    expect(typeof requestBody.customer_id).toBe("string");
    expect(requestBody.customer_id).not.toBe("");
  });

  it("shows a friendly unlocked message once the loyalty discount has applied", async () => {
    setAuditTrail({
      events: [
        {
          timestamp: "2026-01-01T00:00:00.000Z",
          actor: "system",
          event_type: "loyalty_discount_applied",
          message:
            "🎁 ₹150.00 loyalty discount applied automatically — orders over ₹800 qualify!",
          metadata: {
            customer_id: "cust-a",
            discount_inr: 150,
          },
          session_id: "session-1",
        },
      ],
    });
    const user = userEvent.setup();
    vi.spyOn(api, "startSession").mockResolvedValue({
      final_message: "Bought it.",
    });

    render(<SessionForm catalogFile="catalog_demo_1.csv" />);
    await user.type(screen.getByLabelText("Goal"), "Buy anything");
    await user.click(
      screen.getByRole("button", { name: /start buyer agent/i })
    );

    await waitFor(() =>
      expect(screen.getByText("You've unlocked ₹150 off!")).toBeInTheDocument()
    );
  });

  it("shows a welcome message once the first-purchase discount has applied", async () => {
    setAuditTrail({
      events: [
        {
          timestamp: "2026-01-01T00:00:00.000Z",
          actor: "system",
          event_type: "first_purchase_discount_applied",
          message:
            "🎉 ₹500.00 first-purchase discount applied — welcome! 50% off your first order.",
          metadata: {
            customer_id: "cust-new",
            discount_inr: 500,
            discount_pct: 0.5,
          },
          session_id: "session-1",
        },
      ],
    });
    const user = userEvent.setup();
    vi.spyOn(api, "startSession").mockResolvedValue({
      final_message: "Bought it.",
    });

    render(<SessionForm catalogFile="catalog_demo_1.csv" />);
    await user.type(screen.getByLabelText("Goal"), "Buy anything");
    await user.click(
      screen.getByRole("button", { name: /start buyer agent/i })
    );

    await waitFor(() =>
      expect(
        screen.getByText("Welcome! You've got 50% off your first order.")
      ).toBeInTheDocument()
    );
  });

  it("prefers the welcome message over the loyalty message when both events are present", async () => {
    setAuditTrail({
      events: [
        {
          timestamp: "2026-01-01T00:00:00.000Z",
          actor: "system",
          event_type: "loyalty_discount_applied",
          message:
            "🎁 ₹50.00 loyalty discount applied automatically — orders over ₹800 qualify!",
          metadata: { customer_id: "cust-a", discount_inr: 50 },
          session_id: "session-1",
        },
        {
          timestamp: "2026-01-01T00:00:01.000Z",
          actor: "system",
          event_type: "first_purchase_discount_applied",
          message:
            "🎉 ₹500.00 first-purchase discount applied — welcome! 50% off your first order.",
          metadata: {
            customer_id: "cust-new",
            discount_inr: 500,
            discount_pct: 0.5,
          },
          session_id: "session-1",
        },
      ],
    });
    const user = userEvent.setup();
    vi.spyOn(api, "startSession").mockResolvedValue({
      final_message: "Bought it.",
    });

    render(<SessionForm catalogFile="catalog_demo_1.csv" />);
    await user.type(screen.getByLabelText("Goal"), "Buy anything");
    await user.click(
      screen.getByRole("button", { name: /start buyer agent/i })
    );

    await waitFor(() =>
      expect(
        screen.getByText("Welcome! You've got 50% off your first order.")
      ).toBeInTheDocument()
    );
    expect(
      screen.queryByText("You've unlocked ₹50 off!")
    ).not.toBeInTheDocument();
  });

  it("shows a friendly nudge message when the buyer is close to the loyalty threshold", async () => {
    setAuditTrail({
      events: [
        {
          timestamp: "2026-01-01T00:00:00.000Z",
          actor: "merchant_agent",
          event_type: "coupon_nudge_shown",
          message: "Add ₹50.00 more to unlock ₹150 off!",
          metadata: {
            product_id: "GS-108",
            total_inr: 750,
            shortfall_inr: 50,
            threshold_inr: 800,
            discount_inr: 150,
          },
          session_id: "session-1",
        },
      ],
    });
    const user = userEvent.setup();
    vi.spyOn(api, "startSession").mockResolvedValue({
      final_message: "Bought it.",
    });

    render(<SessionForm catalogFile="catalog_demo_1.csv" />);
    await user.type(screen.getByLabelText("Goal"), "Buy anything");
    await user.click(
      screen.getByRole("button", { name: /start buyer agent/i })
    );

    await waitFor(() =>
      expect(
        screen.getByText("Add ₹50 more to get ₹150 off!")
      ).toBeInTheDocument()
    );
  });

  it("does not show the ⚡ emoji in the completed-in duration badge", async () => {
    setAuditTrail({
      events: [
        {
          timestamp: "2026-01-01T00:00:00.000Z",
          actor: "buyer_agent",
          event_type: "decision",
          message: "Starting session with goal: Buy anything",
          metadata: {},
          session_id: "session-1",
        },
        {
          timestamp: "2026-01-01T00:00:14.000Z",
          actor: "buyer_agent",
          event_type: "decision",
          message: "Bought it.",
          metadata: { final: true },
          session_id: "session-1",
        },
      ],
    });
    const user = userEvent.setup();
    vi.spyOn(api, "startSession").mockResolvedValue({
      final_message: "Bought it.",
    });

    render(<SessionForm catalogFile="catalog_demo_1.csv" />);
    await user.type(screen.getByLabelText("Goal"), "Buy anything");
    await user.click(
      screen.getByRole("button", { name: /start buyer agent/i })
    );

    const badge = await screen.findByText(/completed in 14 seconds/i);
    expect(badge.textContent).not.toContain("⚡");
  });
});
