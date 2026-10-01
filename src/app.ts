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
import { PaymentController } from "./app/module/payment/payment.controller";
import { AppointmentService } from "./app/module/appointment/appointment.service";
import { AppointmentReminder } from "./app/module/appointment/appointment.reminder";
import { PaymentService } from "./app/module/payment/payment.service";
import { PrescriptionService } from "./app/module/prescription/prescription.service";

const app = express();
//middleware for parsing query string
app.set("query parser", (str: string) => qs.parse(str));
app.set("view engine", "ejs");
app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  PaymentController.handleStripeEventWebhook,
);
app.set("views", path.resolve(process.cwd(), `src/app/templates`));
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:5000",
      envVars.FRONTEND_URL,
      envVars.BETTER_AUTH_URL,
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Set-Cookie", "Idempotency-Key"],
  }),
);
// better-auth must be mounted BEFORE express.json() (it reads the raw body itself).
// Over HTTP we only expose what the Google login flow needs. Everything else
// (email sign-up/sign-in, password change, ...) must go through /api/v1/auth, which
// adds our validation, lockout and JWTs. Server-side auth.api.* calls are not affected.
const PUBLIC_BETTER_AUTH_PATHS = ["/sign-in/social", "/error", "/ok"];
const allowPublicBetterAuthPaths = (req: Request, res: Response, next: NextFunction) => {
  const isAllowed =
    PUBLIC_BETTER_AUTH_PATHS.includes(req.path) || req.path.startsWith("/callback/");
  if (!isAllowed) {
    return res.status(404).json({ success: false, message: "Not found" });
  }
  next();
};
app.use("/api/auth", allowPublicBetterAuthPaths, toNodeHandler(auth));

app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());
app.use(express.urlencoded({ extended: true, limit: "100kb" }));
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
      console.error(`Cron (${name}) failed:`, error);
    }
  }
});
// Daily at 03:00: compare Stripe with the DB and log any mismatch (read-only)
cron.schedule("0 3 * * *", async () => {
  try {
    await PaymentService.reconcilePayments();
  } catch (error) {
    console.error("Cron (payment reconciliation) failed:", error);
  }
});
app.use("/api/v1", IndexRoutes);

app.get("/", (req: Request, res: Response) => {
  res.send("Hello, TypeScript Express!");
});
app.use(globalErrorHandler);
app.use(notFound);
export default app;
