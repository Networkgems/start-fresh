// Removal tracking: derive removal items from a report and advance their status.
//
// A "removal" is one tracked takedown/opt-out we run on the user's behalf via a
// SANCTIONED, published channel (broker opt-out form, Google "Results about you"
// suppression, platform account controls). This module only models the tracking
// state machine; the actual opt-out submissions live in STA-5/STA-7/STA-9/STA-10.

import { randomUUID } from "node:crypto";
import { store } from "./store.js";
import { resolveImageTakedown } from "./reputation/images.js";
import { socialDisconnectFor } from "./reputation/social.js";
import { brokerById } from "./reputation/brokers.js";
import { buildOptOutRequest } from "./reputation/optout.js";
import type {
  DisconnectGuidance,
  FindingCategory,
  OptOutRequest,
  Removal,
  RemovalStatus,
  Report,
  TakedownRequest,
} from "./types.js";

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
    // Image findings get a per-host takedown request routed to the correct
    // sanctioned channel (STA-6); the channel label reflects that specific
    // route rather than the generic category default.
    let takedown: TakedownRequest | undefined;
    let guidance: DisconnectGuidance | undefined;
    let optOut: OptOutRequest | undefined;
    let channel = CHANNEL[f.category];
    if (f.category === "image") {
      takedown = resolveImageTakedown(f, report.subjectName);
      channel = takedown.channel;
    } else if (f.category === "social") {
      // Social findings become a tracked disconnect action with platform-specific
      // guided steps and links to the platform's published self-service controls
      // (STA-7). The channel label reflects the specific platform.
      const disconnect = socialDisconnectFor(f);
      channel = disconnect.channel;
      guidance = disconnect.guidance;
    } else if (f.category === "data_broker") {
      // Data-broker findings become a templated, ready-to-submit opt-out request
      // routed to the broker's own published channel (STA-5). The channel label
      // names the broker + method the request is prepared for.
      const broker = f.brokerId ? brokerById(f.brokerId) : undefined;
      if (broker) {
        optOut = buildOptOutRequest(broker, report.subjectName, f.url);
        channel = `${broker.name} opt-out (${optOut.method === "email" ? "email" : "web form"})`;
      }
    }
    const removal: Removal = {
      id: randomUUID(),
      caseId: report.caseId,
      findingId: f.id,
      category: f.category,
      target: f.title,
      channel,
      ...(optOut ? { optOut } : {}),
      ...(takedown ? { takedown } : {}),
      ...(guidance ? { guidance } : {}),
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
