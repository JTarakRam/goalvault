import { createHmac, timingSafeEqual } from "node:crypto";
import type { WebhookEvent } from "./types.js";

export const SIGNATURE_HEADER = "x-goalvault-signature";
const TOLERANCE_SECONDS = 300;

/** Signature format: `t=<unix seconds>,v1=<hex hmac-sha256(secret, "<t>.<rawBody>")>` */
export function sign(secret: string, rawBody: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const mac = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return `t=${timestamp},v1=${mac}`;
}

export function verify(
  secret: string,
  rawBody: string,
  header: string | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
): WebhookEvent {
  if (!header) throw new WebhookError("Missing signature");
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=", 2) as [string, string]));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || !parts.v1) throw new WebhookError("Malformed signature");
  if (Math.abs(nowSeconds - t) > TOLERANCE_SECONDS) throw new WebhookError("Signature timestamp outside tolerance");
  const expected = Buffer.from(createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex"), "hex");
  const given = Buffer.from(parts.v1, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new WebhookError("Invalid signature");
  }
  return JSON.parse(rawBody) as WebhookEvent;
}

export class WebhookError extends Error {}
