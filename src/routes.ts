// JSON API routes for the Start Fresh user surface.

import { Router, type Request, type Response } from "express";
import {
  clearSessionCookie,
  hashPassword,
  requireAuth,
  SESSION_COOKIE,
  setSessionCookie,
  validateCredentials,
  verifyPassword,
} from "./auth.js";
import { generateReport } from "./report.js";
import { advanceRemoval, deriveRemovals } from "./removals.js";
import { store } from "./store.js";
import { randomUUID } from "node:crypto";
import { toPublicUser, type RemovalStatus } from "./types.js";

export function apiRouter(): Router {
  const router = Router();

  // --- auth ---
  router.post("/auth/signup", (req: Request, res: Response) => {
    const v = validateCredentials(req.body?.email, req.body?.password);
    if (!v.ok) return res.status(400).json({ error: v.error });
    if (store.getUserByEmail(v.email)) {
      return res.status(409).json({ error: "email_taken" });
    }
    const { hash, salt } = hashPassword(v.password);
    const user = store.createUser(v.email, hash, salt);
    const token = store.createSession(user.id);
    setSessionCookie(res, token);
    return res.status(201).json({ user: toPublicUser(user) });
  });

  router.post("/auth/login", (req: Request, res: Response) => {
    const v = validateCredentials(req.body?.email, req.body?.password);
    if (!v.ok) return res.status(400).json({ error: v.error });
    const user = store.getUserByEmail(v.email);
    // Same response for unknown user and bad password (no account enumeration).
    if (!user || !verifyPassword(v.password, user.salt, user.passwordHash)) {
      return res.status(401).json({ error: "invalid_credentials" });
    }
    const token = store.createSession(user.id);
    setSessionCookie(res, token);
    return res.json({ user: toPublicUser(user) });
  });

  router.post("/auth/logout", (req: Request, res: Response) => {
    store.destroySession(req.cookies?.[SESSION_COOKIE]);
    clearSessionCookie(res);
    return res.json({ ok: true });
  });

  router.get("/me", (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "not_authenticated" });
    return res.json({ user: toPublicUser(req.user) });
  });

  // --- cases (everything below requires auth) ---
  router.use(requireAuth);

  // Submit a name -> create a case, generate a report, derive removals.
  router.post("/cases", async (req: Request, res: Response) => {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (name.length < 2 || name.length > 120) {
      return res.status(400).json({ error: "invalid_name" });
    }
    const caseId = randomUUID();
    const report = await generateReport(name, caseId);
    const c = store.createCase(req.user!.id, name, report);
    const removals = deriveRemovals(report);
    return res.status(201).json({ case: c, report, removals });
  });

  router.get("/cases", (req: Request, res: Response) => {
    const cases = store.listCasesForUser(req.user!.id).map((c) => {
      const removals = store.listRemovalsForCase(c.id);
      const report = store.getReport(c.reportId);
      return {
        ...c,
        score: report?.score ?? null,
        findingCount: report?.findings.length ?? 0,
        removalCount: removals.length,
        removedCount: removals.filter((r) => r.status === "removed").length,
      };
    });
    return res.json({ cases });
  });

  router.get("/cases/:id", (req: Request, res: Response) => {
    const c = store.getCase(req.params.id);
    if (!c || c.userId !== req.user!.id) {
      return res.status(404).json({ error: "case_not_found" });
    }
    const report = store.getReport(c.reportId);
    const removals = store.listRemovalsForCase(c.id);
    return res.json({ case: c, report, removals });
  });

  // Advance a removal's tracked status.
  router.post("/cases/:id/removals/:removalId/advance", (req: Request, res: Response) => {
    const c = store.getCase(req.params.id);
    if (!c || c.userId !== req.user!.id) {
      return res.status(404).json({ error: "case_not_found" });
    }
    const removal = store.getRemoval(req.params.removalId);
    if (!removal || removal.caseId !== c.id) {
      return res.status(404).json({ error: "removal_not_found" });
    }
    const to = req.body?.to as RemovalStatus | undefined;
    const result = advanceRemoval(removal.id, to);
    if (!result.ok) return res.status(409).json({ error: result.error });
    return res.json({ removal: result.removal });
  });

  return router;
}
