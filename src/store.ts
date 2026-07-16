// In-memory data store for the Start Fresh MVP.
//
// PRIVACY: identity data (names, reports, removal records) is held only in
// process memory and never written to disk. That is deliberate for this MVP —
// it proves the end-to-end flow within a running instance without persisting
// sensitive user data. Everything lives behind small repository functions so a
// real (encrypted, access-controlled) database can replace this later without
// changing routes or UI. Data does not survive a restart/redeploy.

import { randomUUID } from "node:crypto";
import type { Case, Removal, Report, User } from "./types.js";

const users = new Map<string, User>();
const usersByEmail = new Map<string, string>(); // lowercased email -> userId
const cases = new Map<string, Case>();
const reports = new Map<string, Report>();
const removals = new Map<string, Removal>();

/** token -> { userId, createdAt } */
interface Session {
  userId: string;
  createdAt: number;
}
const sessions = new Map<string, Session>();

export const store = {
  // --- users ---
  createUser(email: string, passwordHash: string, salt: string): User {
    const user: User = {
      id: randomUUID(),
      email,
      passwordHash,
      salt,
      createdAt: new Date().toISOString(),
    };
    users.set(user.id, user);
    usersByEmail.set(email.toLowerCase(), user.id);
    return user;
  },
  getUserByEmail(email: string): User | undefined {
    const id = usersByEmail.get(email.toLowerCase());
    return id ? users.get(id) : undefined;
  },
  getUserById(id: string): User | undefined {
    return users.get(id);
  },

  // --- sessions ---
  createSession(userId: string): string {
    const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
    sessions.set(token, { userId, createdAt: Date.now() });
    return token;
  },
  getSessionUser(token: string | undefined): User | undefined {
    if (!token) return undefined;
    const s = sessions.get(token);
    return s ? users.get(s.userId) : undefined;
  },
  destroySession(token: string | undefined): void {
    if (token) sessions.delete(token);
  },

  // --- cases & reports ---
  createCase(userId: string, subjectName: string, report: Report): Case {
    const c: Case = {
      id: report.caseId,
      userId,
      subjectName,
      createdAt: new Date().toISOString(),
      reportId: report.id,
    };
    cases.set(c.id, c);
    reports.set(report.id, report);
    return c;
  },
  getCase(id: string): Case | undefined {
    return cases.get(id);
  },
  listCasesForUser(userId: string): Case[] {
    return [...cases.values()]
      .filter((c) => c.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  getReport(id: string): Report | undefined {
    return reports.get(id);
  },

  // --- removals ---
  addRemoval(r: Removal): Removal {
    removals.set(r.id, r);
    return r;
  },
  getRemoval(id: string): Removal | undefined {
    return removals.get(id);
  },
  listRemovalsForCase(caseId: string): Removal[] {
    return [...removals.values()]
      .filter((r) => r.caseId === caseId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },
  saveRemoval(r: Removal): void {
    removals.set(r.id, r);
  },
};
