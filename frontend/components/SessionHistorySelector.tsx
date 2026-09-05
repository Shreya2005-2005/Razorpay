"use client";

import { useAuditTrail } from "@/hooks/useAuditTrail";

function formatTime(timestamp: string): string {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return timestamp;
  return parsed.toLocaleTimeString(undefined, {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function SessionHistorySelector() {
  const { sessions, activeSessionId, isLive, selectSession } = useAuditTrail();

  if (sessions.length === 0) return null;

  return (
    <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm">
      <span className="text-[var(--text-secondary)]">Session:</span>
      <select
        value={activeSessionId ?? ""}
        onChange={(e) => selectSession(e.target.value || null)}
        className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1.5 text-sm text-[var(--text-primary)] focus:border-[var(--border-strong)] focus:ring-1 focus:ring-[var(--border-strong)] focus:outline-none"
      >
        {sessions.map((session) => (
          <option key={session.id} value={session.id}>
            {formatTime(session.timestamp)} — {session.goal}
          </option>
        ))}
      </select>
      {isLive ? (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)]">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--text-tertiary)]" />
          Live
        </span>
      ) : (
        <button
          type="button"
          onClick={() => selectSession(null)}
          className="shrink-0 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)] hover:opacity-80"
        >
          Back to live
        </button>
      )}
    </div>
  );
}
