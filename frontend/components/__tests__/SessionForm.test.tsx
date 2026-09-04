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
});
