import express, { type NextFunction, type Request, type Response, Router } from "express";
import { z, ZodError } from "zod";
import { issueToken, requireUser } from "../auth.js";
import { rupeesToPaise } from "../money.js";
import type { SandboxProvider } from "../payments/sandbox.js";
import { SIGNATURE_HEADER, verify, WebhookError } from "../payments/webhook.js";
import { AppError, type GoalVault } from "../service.js";

const frequency = z.enum(["daily", "weekly", "monthly"]);
const category = z.enum(["laptop", "smartphone", "travel", "education", "gadget", "other"]);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const rupees = z.number().positive().max(1_00_00_000).transform(rupeesToPaise);

const createGoalBody = z.object({
  name: z.string().trim().min(1).max(60),
  category,
  targetRupees: rupees.refine((p) => p >= 100_00, "Target must be at least ₹100"),
  deadline: isoDate,
  frequency,
  contributionRupees: rupees.optional(),
});
const editGoalBody = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  category: category.optional(),
  targetRupees: rupees.optional(),
  deadline: isoDate.optional(),
  frequency: frequency.optional(),
  contributionRupees: rupees.optional(),
});
const mandateBody = z.object({
  method: z.enum(["upi_autopay", "enach"]),
  payer: z.string().trim().min(3).max(256),
  consentAccepted: z.literal(true, { errorMap: () => ({ message: "Consent is required" }) }),
  consentVersion: z.string(),
});
const amountBody = z.object({ amountRupees: rupees, payer: z.string().trim().min(3).max(256).optional() });

type Handler = (req: Request, res: Response) => Promise<unknown> | unknown;
const h = (fn: Handler) => (req: Request, res: Response, next: NextFunction) =>
  Promise.resolve(fn(req, res))
    .then((body) => {
      if (!res.headersSent) res.json(body ?? { ok: true });
    })
    .catch(next);

const meta = (req: Request) => ({ ip: req.ip ?? "", userAgent: req.header("user-agent") ?? "" });
const idem = (req: Request) => {
  const key = req.header("idempotency-key");
  if (!key || key.length < 8 || key.length > 128) throw new AppError(400, "Idempotency-Key header is required");
  return key;
};

export function apiRouter(opts: {
  app: GoalVault;
  sessionSecret: string;
  webhookSecret: string;
  sandbox: SandboxProvider | null;
}) {
  const { app, sessionSecret, webhookSecret, sandbox } = opts;
  const r = Router();

  // Webhooks need the raw body for signature verification, so they're mounted before express.json().
  r.post("/webhooks/payments", express.raw({ type: "*/*", limit: "100kb" }), (req, res) => {
    try {
      const event = verify(webhookSecret, req.body.toString("utf8"), req.header(SIGNATURE_HEADER));
      res.json(app.handleWebhook(event));
    } catch (e) {
      const status = e instanceof WebhookError ? 401 : 400;
      res.status(status).json({ error: { code: "webhook_rejected", message: (e as Error).message } });
    }
  });

  r.use(express.json({ limit: "20kb" }));

  r.post(
    "/auth/demo",
    h(() => {
      const user = app.ensureDemoUser();
      return { token: issueToken(sessionSecret, user.id) };
    }),
  );

  const authed = Router();
  authed.use(requireUser(sessionSecret));
  const uid = (res: Response) => res.locals.userId as string;

  authed.get("/me/summary", h((_req, res) => app.summary(uid(res))));
  authed.post("/me/terms", h((req, res) => app.acceptTerms(uid(res), meta(req))));

  authed.post(
    "/goals",
    h((req, res) => {
      const b = createGoalBody.parse(req.body);
      return app.goalView(
        app.createGoal(uid(res), {
          name: b.name,
          category: b.category,
          targetPaise: b.targetRupees,
          deadline: b.deadline,
          frequency: b.frequency,
          contributionPaise: b.contributionRupees,
        }),
      );
    }),
  );
  authed.get("/goals/:id", h((req, res) => app.goalView(app.goal(uid(res), req.params.id!))));
  authed.patch(
    "/goals/:id",
    h((req, res) => {
      const b = editGoalBody.parse(req.body);
      const { goal, requiresReauthorization } = app.editGoal(uid(res), req.params.id!, {
        name: b.name,
        category: b.category,
        targetPaise: b.targetRupees,
        deadline: b.deadline,
        frequency: b.frequency,
        contributionPaise: b.contributionRupees,
      });
      return { goal: app.goalView(goal), requiresReauthorization };
    }),
  );
  authed.post("/goals/:id/pause", h(async (req, res) => app.goalView(await app.pauseGoal(uid(res), req.params.id!))));
  authed.post("/goals/:id/resume", h(async (req, res) => app.goalView(await app.resumeGoal(uid(res), req.params.id!))));
  authed.get(
    "/goals/:id/mandate/preview",
    h((req, res) => {
      const method = z.enum(["upi_autopay", "enach"]).parse(req.query.method);
      const payer = z.string().min(1).parse(req.query.payer);
      return app.consentPreview(uid(res), req.params.id!, method, payer);
    }),
  );
  authed.post(
    "/goals/:id/mandate",
    h((req, res) => app.createMandate(uid(res), req.params.id!, mandateBody.parse(req.body), meta(req))),
  );
  authed.post(
    "/goals/:id/contribute",
    h((req, res) => {
      const b = amountBody.parse(req.body);
      return app.contributeOnce(uid(res), req.params.id!, b.amountRupees, b.payer ?? "", idem(req));
    }),
  );
  authed.post(
    "/goals/:id/withdraw",
    h((req, res) => {
      const b = amountBody.parse(req.body);
      return app.withdraw(uid(res), req.params.id!, b.amountRupees, idem(req), meta(req));
    }),
  );
  authed.post("/mandates/:id/revoke", h(async (req, res) => app.revokeMandate(uid(res), req.params.id!)));
  authed.get("/transactions", h((req, res) => app.transactions(uid(res), req.query.goalId as string | undefined)));
  authed.get("/notifications", h((_req, res) => app.notifications(uid(res))));
  authed.post("/notifications/read", h((_req, res) => app.markRead(uid(res))));
  authed.get("/trust", h((_req, res) => app.trust(uid(res))));

  // Sandbox-only controls: simulate the user's UPI app and fast-forward time.
  if (sandbox) {
    authed.post(
      "/sandbox/mandates/:ref/:decision",
      h(async (req) => {
        sandbox.approve(req.params.ref!, req.params.decision === "approve");
        await sandbox.flush();
        return { ok: true };
      }),
    );
    authed.post(
      "/sandbox/advance",
      h(async (req) => {
        const days = z.number().int().min(1).max(60).parse(req.body.days ?? 1);
        for (let i = 0; i < days * 4; i++) {
          app.clock.offsetMs += 6 * 3_600_000; // 6h steps so notices & debits land in order
          await app.runScheduler();
          await sandbox.flush();
        }
        return { now: app.clock.now().toISOString() };
      }),
    );
    authed.post(
      "/sandbox/flush",
      h(async () => {
        await sandbox.flush();
        return { ok: true };
      }),
    );
  }

  r.use(authed);

  r.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: { code: "validation", message: err.issues[0]?.message ?? "Invalid input" } });
    }
    if (err instanceof AppError) return res.status(err.status).json({ error: { code: err.code, message: err.message } });
    console.error(err);
    res.status(500).json({ error: { code: "internal", message: "Something went wrong. No money has moved." } });
  });
  return r;
}
