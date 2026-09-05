"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { API_BASE_URL } from "@/lib/api";
import type { AuditEvent } from "@/lib/types";

export type ConnectionState = "connecting" | "open" | "error";

export const SESSION_START_PREFIX = "Starting session with goal: ";

export interface SessionSummary {
  id: string;
  timestamp: string;
  goal: string;
}

interface AuditTrailContextValue {
  events: AuditEvent[];
  /** Every event across every session seen this connection, unfiltered —
   * for cross-session views (e.g. MerchantRevenuePanel) that need to
   * aggregate over history rather than follow one session. */
  allEvents: AuditEvent[];
  connectionState: ConnectionState;
  sessions: SessionSummary[];
  activeSessionId: string | null;
  isLive: boolean;
  selectSession: (id: string | null) => void;
}

const AuditTrailContext = createContext<AuditTrailContextValue | null>(null);

export function AuditTrailProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("connecting");
  const [latestSessionId, setLatestSessionId] = useState<string | null>(null);
  // null = follow whichever session is currently live; a concrete id pins the
  // view to that past session until a new session starts.
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null
  );
  const latestSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    const source = new EventSource(`${API_BASE_URL}/api/audit/stream`);

    source.onopen = () => {
      // The backend replays full history on every new connection, so a
      // (re)connect always starts from a clean slate to avoid duplicates.
      setEvents([]);
      latestSessionIdRef.current = null;
      setLatestSessionId(null);
      setSelectedSessionId(null);
      setConnectionState("open");
    };

    source.addEventListener("audit", (event: MessageEvent) => {
      try {
        const parsed: AuditEvent = JSON.parse(event.data);
        setEvents((prev) => [...prev, parsed]);
        if (
          parsed.session_id &&
          parsed.session_id !== latestSessionIdRef.current
        ) {
          latestSessionIdRef.current = parsed.session_id;
          setLatestSessionId(parsed.session_id);
          // A genuinely new session started — snap back to live so it isn't
          // hidden behind whatever past session was being viewed.
          setSelectedSessionId(null);
        }
      } catch {
        // Ignore malformed payloads rather than crashing the stream.
      }
    });

    source.onerror = () => {
      setConnectionState("error");
    };

    return () => {
      source.close();
    };
  }, []);

  const sessions = useMemo(() => {
    const firstEventBySession = new Map<string, AuditEvent>();
    for (const event of events) {
      if (event.session_id && !firstEventBySession.has(event.session_id)) {
        firstEventBySession.set(event.session_id, event);
      }
    }
    return Array.from(firstEventBySession.entries())
      .map(([id, event]) => ({
        id,
        timestamp: event.timestamp,
        goal: event.message.startsWith(SESSION_START_PREFIX)
          ? event.message.slice(SESSION_START_PREFIX.length)
          : event.message,
      }))
      .reverse();
  }, [events]);

  const activeSessionId = selectedSessionId ?? latestSessionId;

  const filteredEvents = useMemo(
    () =>
      activeSessionId
        ? events.filter((e) => e.session_id === activeSessionId)
        : events,
    [events, activeSessionId]
  );

  return (
    <AuditTrailContext.Provider
      value={{
        events: filteredEvents,
        allEvents: events,
        connectionState,
        sessions,
        activeSessionId,
        isLive: selectedSessionId === null,
        selectSession: setSelectedSessionId,
      }}
    >
      {children}
    </AuditTrailContext.Provider>
  );
}

export function useAuditTrail(): AuditTrailContextValue {
  const ctx = useContext(AuditTrailContext);
  if (!ctx) {
    throw new Error("useAuditTrail must be used within an AuditTrailProvider");
  }
  return ctx;
}
