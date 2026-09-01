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
    <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <span className="text-zinc-500 dark:text-zinc-400">Session:</span>
      <select
        value={activeSessionId ?? ""}
        onChange={(e) => selectSession(e.target.value || null)}
        className="flex-1 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      >
        {sessions.map((session) => (
          <option key={session.id} value={session.id}>
            {formatTime(session.timestamp)} — {session.goal}
          </option>
        ))}
      </select>
      {isLive ? (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-500/10 dark:text-green-300">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
          Live
        </span>
      ) : (
        <button
          type="button"
          onClick={() => selectSession(null)}
          className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          Back to live
        </button>
      )}
    </div>
  );
}
