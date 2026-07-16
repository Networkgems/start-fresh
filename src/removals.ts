// Removal tracking: derive removal items from a report and advance their status.
//
// A "removal" is one tracked takedown/opt-out we run on the user's behalf via a
// SANCTIONED, published channel (broker opt-out form, Google "Results about you"
// suppression, platform account controls). This module only models the tracking
// state machine; the actual opt-out submissions live in STA-5/STA-7/STA-9/STA-10.

import { randomUUID } from "node:crypto";
import { store } from "./store.js";
import type { FindingCategory, Removal, RemovalStatus, Report } from "./types.js";

// Sanctioned channel description per category (what a user is told we use).
const CHANNEL: Record<FindingCategory, string> = {
  data_broker: "Data-broker opt-out form",
  web: 'Google "Results about you" suppression request',
  social: "Platform privacy / account controls",
  image: "Image takedown / de-index request",
};

// Allowed forward transitions for the tracker.
const NEXT: Record<RemovalStatus, RemovalStatus | null> = {
  pending: "submitted",
  submitted: "in_progress",
  in_progress: "removed",
  removed: null,
  rejected: null,
};

const NOTE: Record<RemovalStatus, string> = {
  pending: "Identified — queued for removal.",
  submitted: "Opt-out / takedown request submitted through the sanctioned channel.",
  in_progress: "Provider acknowledged the request; processing.",
  removed: "Confirmed removed from the source.",
  rejected: "Provider declined or item is not removable.",
};

/** Create a pending removal for every removable finding in a report. */
export function deriveRemovals(report: Report): Removal[] {
  const now = new Date().toISOString();
  const created: Removal[] = [];
  for (const f of report.findings) {
    if (!f.removable) continue;
    const removal: Removal = {
      id: randomUUID(),
      caseId: report.caseId,
      findingId: f.id,
      category: f.category,
      target: f.title,
      channel: CHANNEL[f.category],
      status: "pending",
      history: [{ at: now, status: "pending", note: NOTE.pending }],
      createdAt: now,
      updatedAt: now,
    };
    store.addRemoval(removal);
    created.push(removal);
  }
  return created;
}

export type AdvanceResult =
  | { ok: true; removal: Removal }
  | { ok: false; error: string };

/**
 * Advance a removal to a specific next status, or one step forward if `to`
 * is omitted. Rejects illegal transitions so the tracker stays consistent.
 */
export function advanceRemoval(removalId: string, to?: RemovalStatus): AdvanceResult {
  const removal = store.getRemoval(removalId);
  if (!removal) return { ok: false, error: "removal_not_found" };

  const target = to ?? NEXT[removal.status];
  if (!target) return { ok: false, error: "already_terminal" };

  // Only allow the single legal forward step, or an explicit rejection.
  const legalForward = NEXT[removal.status];
  if (target !== legalForward && target !== "rejected") {
    return { ok: false, error: "illegal_transition" };
  }

  const now = new Date().toISOString();
  removal.status = target;
  removal.updatedAt = now;
  removal.history.push({ at: now, status: target, note: NOTE[target] });
  store.saveRemoval(removal);
  return { ok: true, removal };
}
