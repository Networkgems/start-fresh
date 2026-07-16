// Authentication: password hashing, session cookies, and route guard.
//
// Passwords are hashed with scrypt (node:crypto) + a per-user random salt.
// Sessions are opaque random tokens stored server-side (see store.ts); the
// client only ever holds the token in an httpOnly cookie, so it is not exposed
// to page JavaScript / XSS.

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { store } from "./store.js";
import type { User } from "./types.js";

export const SESSION_COOKIE = "sf_session";
const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return { hash, salt };
}

export function verifyPassword(password: string, salt: string, hash: string): boolean {
  const candidate = scryptSync(password, salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(hash, "hex");
  // Guard timingSafeEqual against length mismatch (it throws otherwise).
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    path: "/",
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

// Augment Express's Request with the resolved user.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

/** Populates req.user if a valid session cookie is present. Never rejects. */
export function attachUser(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  req.user = store.getSessionUser(token);
  next();
}

/** Rejects unauthenticated API requests with 401. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "not_authenticated" });
    return;
  }
  next();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateCredentials(
  email: unknown,
  password: unknown,
): { ok: true; email: string; password: string } | { ok: false; error: string } {
  if (typeof email !== "string" || !EMAIL_RE.test(email.trim())) {
    return { ok: false, error: "invalid_email" };
  }
  if (typeof password !== "string" || password.length < 8) {
    return { ok: false, error: "weak_password" }; // min 8 chars
  }
  return { ok: true, email: email.trim(), password };
}
