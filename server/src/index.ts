import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { SandboxProvider } from "./payments/sandbox.js";
import { apiRouter } from "./routes/api.js";
import { GoalVault } from "./service.js";
import { Store } from "./store.js";

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 4000);
const isProd = process.env.NODE_ENV === "production";
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ?? (isProd ? "" : "dev-webhook-secret");
const SESSION_SECRET = process.env.SESSION_SECRET ?? (isProd ? "" : "dev-session-secret");
if (!WEBHOOK_SECRET || !SESSION_SECRET) throw new Error("WEBHOOK_SECRET and SESSION_SECRET are required in production");
if ((process.env.PAYMENT_PROVIDER ?? "sandbox") !== "sandbox") {
  throw new Error("Only the sandbox provider ships in this repo. See docs/COMPLIANCE.md to integrate a licensed partner.");
}

const store = new Store(join(here, "..", "data", "db.json"));
const sandbox = new SandboxProvider(WEBHOOK_SECRET);
const app = new GoalVault(store, sandbox);

const server = express();
server.disable("x-powered-by");
server.set("trust proxy", 1);
server.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("Cache-Control", "no-store");
  next();
});
server.use("/api", apiRouter({ app, sessionSecret: SESSION_SECRET, webhookSecret: WEBHOOK_SECRET, sandbox }));

// The sandbox delivers webhooks to the same verified endpoint real providers would call.
sandbox.attach(async (raw, signature) => {
  const res = await fetch(`http://127.0.0.1:${PORT}/api/webhooks/payments`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goalvault-signature": signature },
    body: raw,
  });
  if (!res.ok) console.error("webhook rejected", res.status, await res.text());
});

// Serve the built web app in production.
const webDist = join(here, "..", "..", "web", "dist");
if (existsSync(webDist)) {
  server.use(express.static(webDist));
  server.get(/^(?!\/api).*/, (_req, res) => res.sendFile(join(webDist, "index.html")));
}

const interval = Number(process.env.SCHEDULER_INTERVAL_MS ?? 30_000);
setInterval(() => {
  app
    .runScheduler()
    .then(() => sandbox.flush())
    .catch((e) => console.error("scheduler", e));
}, interval);

server.listen(PORT, () => console.log(`GoalVault API on http://localhost:${PORT}`));
