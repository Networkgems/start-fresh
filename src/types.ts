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
