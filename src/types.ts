// Domain types for the Start Fresh user surface.
//
// These describe the reputation-cleanup workflow a user moves through:
//   sign up -> submit a name -> get a report -> track removals.
// The shapes are intentionally storage-agnostic so the in-memory store today
// can be swapped for a real database later without touching route/UI code.

export type FindingCategory = "web" | "data_broker" | "social" | "image";

export type Severity = "low" | "medium" | "high";

/** A single thing we found about the subject on the open web / brokers. */
export interface Finding {
  id: string;
  category: FindingCategory;
  /** Human-readable source, e.g. "Spokeo", "Google News", "Facebook". */
  source: string;
  title: string;
  url?: string;
  snippet: string;
  severity: Severity;
  /** Whether we have a sanctioned removal / opt-out path for this item. */
  removable: boolean;
  /**
   * For `data_broker` findings, the registry id of the broker (brokers.ts).
   * Lets the removal workflow build a templated opt-out request against the
   * broker's published channel. Absent for non-broker findings.
   */
  brokerId?: string;
}

/** The reputation report generated for a case. */
export interface Report {
  id: string;
  caseId: string;
  subjectName: string;
  generatedAt: string;
  /** 0-100, higher = cleaner online reputation. */
  score: number;
  summary: string;
  findings: Finding[];
}

export type RemovalStatus =
  | "pending" // identified, not yet actioned
  | "submitted" // opt-out / takedown request sent
  | "in_progress" // provider acknowledged, processing
  | "removed" // confirmed gone
  | "rejected"; // provider declined / not removable

export interface RemovalEvent {
  at: string;
  status: RemovalStatus;
  note: string;
}

/** A published, self-service control link for a platform (STA-7). */
export interface DisconnectControl {
  /** e.g. "Privacy settings", "Deactivate / delete account". */
  label: string;
  url: string;
}

/**
 * Guided disconnect instructions attached to a `social` removal (STA-7).
 *
 * Social platforms offer no sanctioned third-party API to delete or de-link an
 * account, so the honest, safe path is user-driven self-service through the
 * platform's own published controls (linked here), with search-engine
 * de-indexing as the fallback for public results the user does not control.
 */
export interface DisconnectGuidance {
  /** Platform display name, e.g. "LinkedIn" or "Social profile". */
  platform: string;
  /** Ordered self-service steps, least-destructive (make private) first. */
  steps: string[];
  /** Published self-service control links (privacy, deactivate, delete). */
  controls: DisconnectControl[];
  /** Plain-language note on what is self-service vs. what we can automate. */
  note: string;
}

/** How the user (or removal ops) submits a generated takedown request. */
export type TakedownMethod =
  | "web_form" // paste/submit into a published takedown/report form
  | "email" // send to a published abuse/legal contact
  | "search_console" // Google "Remove images of yourself" / de-index tool
  | "outdated_content"; // Google "Remove Outdated Content" cache-clear tool

/**
 * A ready-to-send takedown request generated for an image hit. This is the
 * actionable artifact STA-6 produces: which SANCTIONED channel to use and a
 * pre-filled subject/body the user (or removal ops) submits there. We never
 * auto-submit or impersonate the user beyond what the published channel asks.
 */
export interface TakedownRequest {
  /** Human-readable channel, e.g. "Google — Remove images of yourself". */
  channel: string;
  /** The published form/tool/contact the request is sent through. */
  channelUrl: string;
  method: TakedownMethod;
  /** Page/host where the image appears (the takedown target). */
  targetUrl?: string;
  /** Pre-filled request subject line. */
  subject: string;
  /** Pre-filled request body the user reviews and submits. */
  body: string;
}

/** How a data-broker opt-out request is submitted through its published channel. */
export type OptOutMethod =
  | "web_form" // completed on the broker's published removal page
  | "email"; // sent to the broker's published opt-out email

/**
 * A ready-to-submit data-broker opt-out request (STA-5). This is the actionable
 * artifact turned from a `data_broker` finding: which PUBLISHED channel to use
 * and a pre-filled subject/body the user (or removal ops) submits there. It only
 * asserts the subject's own removal rights (CCPA/CPRA-style) — no impersonation
 * or evasion beyond what the broker's own opt-out form legitimately requires,
 * and we never auto-submit or bypass any access control.
 */
export interface OptOutRequest {
  /** Registry id of the broker this request targets. */
  brokerId: string;
  brokerName: string;
  method: OptOutMethod;
  /** The broker's PUBLISHED opt-out page (or the page documenting the process). */
  channelUrl: string;
  /** Published opt-out email address, when `method` is "email". */
  channelEmail?: string;
  /** The broker's public listing URL this request asks to remove. */
  listingUrl?: string;
  /** Pre-filled request subject line. */
  subject: string;
  /** Pre-filled request body the user reviews and submits. */
  body: string;
}

/** A tracked removal derived from a removable finding. */
export interface Removal {
  id: string;
  caseId: string;
  findingId: string;
  category: FindingCategory;
  /** What we're removing, e.g. "Spokeo listing for Jane Doe". */
  target: string;
  /** Sanctioned channel used, e.g. broker opt-out URL / takedown form. */
  channel: string;
  /**
   * For data-broker removals: the generated, ready-to-submit opt-out request
   * (STA-5). Absent for categories that don't produce a broker opt-out payload.
   */
  optOut?: OptOutRequest;
  /**
   * For image removals: the generated, ready-to-send takedown request (STA-6).
   * Absent for categories that don't produce a per-item request payload.
   */
  takedown?: TakedownRequest;
  /**
   * For image removals: a follow-up request to clear Google's CACHED copy of the
   * image (thumbnail / cached snapshot) via Google's public "Remove Outdated
   * Content" tool (STA-14). The `takedown` above gets the image removed at its
   * source (or suppressed in Search); this clears the stale copy Google keeps
   * serving afterward. Absent for non-image removals.
   */
  cacheClear?: TakedownRequest;
  /**
   * For social removals: guided disconnect / de-link instructions plus links to
   * the platform's published self-service controls (STA-7). Absent for
   * categories that don't need per-item guidance.
   */
  guidance?: DisconnectGuidance;
  status: RemovalStatus;
  history: RemovalEvent[];
  createdAt: string;
  updatedAt: string;
}

/** A reputation-cleanup case for one submitted name. */
export interface Case {
  id: string;
  userId: string;
  subjectName: string;
  createdAt: string;
  reportId: string;
}

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
}

/** User shape safe to send to the client (no secrets). */
export interface PublicUser {
  id: string;
  email: string;
  createdAt: string;
}

export function toPublicUser(u: User): PublicUser {
  return { id: u.id, email: u.email, createdAt: u.createdAt };
}
