import { createHash, randomBytes } from "node:crypto";

export const newId = (prefix: string) => `${prefix}_${randomBytes(9).toString("base64url")}`;
export const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
export const nowIso = () => new Date().toISOString();
