import type { SessionSummary } from "@/lib/sessionSummary";

/** Builds the one-line, plain-English summary shown at the top of the
 * Audit Trail panel — assembled from what summarizeSession() actually
 * found in the session's events, not a fixed template, so it reflects
 * failure/recovery/stop cases as accurately as the success case. */
export function generateSessionNarrative(summary: SessionSummary): string {
  if (!summary.goal) {
    return "No session activity yet.";
  }

  const clauses: string[] = [
    `Buyer wanted ${summary.goal.replace(/\.+$/, "")}`,
  ];

  if (summary.settlements.length > 0) {
    const rounds = summary.negotiationRounds;
    const roundsPhrase =
      rounds > 0
        ? `negotiated ${rounds} round${rounds === 1 ? "" : "s"}`
        : "negotiated a price";
    clauses.push(
      summary.totalSavedInr > 0
        ? `${roundsPhrase}, saved ₹${summary.totalSavedInr.toFixed(0)}`
        : roundsPhrase
    );
  } else if (summary.payment.attempted) {
    clauses.push("bought at list price");
  }

  if (summary.recoveries.length > 0) {
    clauses.push(
      summary.recoveries.length === 1
        ? `recovered from an issue (${summary.recoveries[0]})`
        : `recovered from ${summary.recoveries.length} issues along the way`
    );
  }

  if (summary.stopped) {
    clauses.push("but was stopped by the user before finishing");
  } else if (summary.payment.captured && summary.payment.verified) {
    clauses.push("payment succeeded");
  } else if (summary.payment.declined) {
    clauses.push("payment was declined");
  } else if (summary.guardrails.blocked > 0 && !summary.payment.attempted) {
    clauses.push("the order was blocked by policy");
  } else if (summary.negotiationFailed && !summary.payment.attempted) {
    clauses.push("no agreement was reached");
  } else if (summary.reachedMaxTurns) {
    clauses.push("couldn't reach a conclusion in time");
  } else if (!summary.isComplete) {
    clauses.push("still in progress");
  }

  return clauses.join(", ") + ".";
}
