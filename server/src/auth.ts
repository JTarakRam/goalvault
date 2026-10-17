import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

/**
 * Stateless signed session tokens: `<userId>.<expiry>.<hmac>`.
 * The demo issues a token for the sandbox user; production replaces /auth/demo with
 * phone OTP + device binding and short-lived access tokens.
 */
export function issueToken(secret: string, userId: string, ttlMs = 7 * 86_400_000) {
  const payload = `${userId}.${Date.now() + ttlMs}`;
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

export function verifyToken(secret: string, token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, exp, mac] = parts as [string, string, string];
  const expected = createHmac("sha256", secret).update(`${userId}.${exp}`).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Number(exp) < Date.now()) return null;
  return userId;
}

export const requireUser = (secret: string) => (req: Request, res: Response, next: NextFunction) => {
  const header = req.header("authorization") ?? "";
  const userId = header.startsWith("Bearer ") ? verifyToken(secret, header.slice(7)) : null;
  if (!userId) return res.status(401).json({ error: { code: "unauthorized", message: "Please sign in again" } });
  res.locals.userId = userId;
  next();
};
