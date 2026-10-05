import { raiseAlert } from "./app/lib/errorTracking";
import express, { NextFunction, Request, Response } from "express";
import { IndexRoutes } from "./app/routes";
import path from "path";
import { notFound } from "./app/middleware/notFound";
import globalErrorHandler from "./app/middleware/globalErrorHandler";
import cron from "node-cron";
import cookieParser from "cookie-parser";
import cors from "cors";
import { envVars } from "./app/config/env";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./app/lib/auth";
import qs from "qs";
import helmet from "helmet";
import { httpLogger } from "./app/lib/logger";
import { requestContext } from "./app/utils/requestContext";
import { registerHealthRoutes } from "./app/utils/lifecycle";
import { runRetentionCleanup } from "./app/utils/retention";
import { apiLimiter, corsOptions, verifyOrigin } from "./app/middleware/security";
import { PaymentController } from "./app/module/payment/payment.controller";
import { AppointmentService } from "./app/module/appointment/appointment.service";
import { AppointmentReminder } from "./app/module/appointment/appointment.reminder";
import { PaymentService } from "./app/module/payment/payment.service";
import { PrescriptionService } from "./app/module/prescription/prescription.service";
// registers what each background job type does (the worker is started in server.ts)
import "./app/jobs/handlers";

const app = express();
// behind a load balancer / reverse proxy set TRUST_PROXY to the number of hops (e.g. 1),
// so req.ip (rate limits) is the client and not the proxy. Default: trust nothing.
app.set("trust proxy", /^\d+$/.test(process.env.TRUST_PROXY ?? "") ? Number(process.env.TRUST_PROXY) : false);
app.disable("x-powered-by");
// /health and /ready for the hosting health checks (before the request log: they run every few seconds)
registerHealthRoutes(app);
app.use(httpLogger);
// client IP + request id for the audit log (utils/requestContext.ts)
app.use(requestContext);
// security headers. The API only returns JSON / PDFs, so the CSP can be strict.
app.use(
  helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    crossOriginResourcePolicy: { policy: "same-site" },
    strictTransportSecurity: envVars.NODE_ENV === "production" ? { maxAge: 31536000, includeSubDomains: true } : false,
  }),
);
//middleware for parsing query string
app.set("query parser", (str: string) => qs.parse(str));
app.set("view engine", "ejs");
app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  PaymentController.handleStripeEventWebhook,
);
app.set("views", path.resolve(process.cwd(), `src/app/templates`));
// exact origin allowlist (see middleware/security.ts)
app.use(cors(corsOptions));
// better-auth must be mounted BEFORE express.json() (it reads the raw body itself).
// Over HTTP we only expose what the Google login flow needs. Everything else
// (email sign-up/sign-in, password change, ...) must go through /api/v1/auth, which
// adds our validation, lockout and JWTs. Server-side auth.api.* calls are not affected.
const PUBLIC_BETTER_AUTH_PATHS = ["/sign-in/social", "/error", "/ok"];
const allowPublicBetterAuthPaths = (req: Request, res: Response, next: NextFunction) => {
  const isAllowed =
    PUBLIC_BETTER_AUTH_PATHS.includes(req.path) || req.path.startsWith("/callback/");
  if (!isAllowed) {
    return res.status(404).json({ success: false, message: "Not found", errorSources: [{ path: req.path, message: "Not found" }] });
  }
  next();
};
app.use("/api/auth", allowPublicBetterAuthPaths, toNodeHandler(auth));

app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());
// (no express.urlencoded: nothing posts HTML forms to the API)
// Background jobs, every 5 minutes. Each job catches its own errors (the next run retries)
// and is safe with several servers: advisory lock / per-appointment claim.
cron.schedule("*/5 * * * *", async () => {
  const jobs: [string, () => Promise<unknown>][] = [
    ["cancel unpaid appointments", () => AppointmentService.cancelUnpaidAppointment()],
    ["1h reminders", () => AppointmentReminder.sendReminders("1h")],
    ["24h reminders", () => AppointmentReminder.sendReminders("24h")],
    ["missing invoices", () => PaymentService.retryMissingInvoices()],
    ["missing prescription PDFs/emails", () => PrescriptionService.retryPrescriptionDelivery()],
  ];
  for (const [name, job] of jobs) {
    try {
      await job();
    } catch (error) {
      raiseAlert("cron_failed", "cron job failed", { job: name }, error);
    }
  }
});
// Daily at 03:30: delete data past its retention period (docs/data-retention.md)
cron.schedule("30 3 * * *", async () => {
  try {
    await runRetentionCleanup();
  } catch (error) {
    raiseAlert("cron_failed", "cron job failed", { job: "retention cleanup" }, error);
  }
});
// Daily at 03:00: compare Stripe with the DB and log any mismatch (read-only)
cron.schedule("0 3 * * *", async () => {
  try {
    await PaymentService.reconcilePayments();
  } catch (error) {
    raiseAlert("cron_failed", "cron job failed", { job: "payment reconciliation" }, error);
  }
});
// CSRF origin check + general rate limit for the whole API (stricter limits on auth routes)
app.use("/api/v1", verifyOrigin, apiLimiter, IndexRoutes);

app.get("/", (req: Request, res: Response) => {
  res.json({ success: true, message: "PH Healthcare API" });
});
app.use(globalErrorHandler);
app.use(notFound);
export default app;
