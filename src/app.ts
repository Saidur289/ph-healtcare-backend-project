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
    allowedHeaders: ["Content-Type", "Authorization", "Set-Cookie"],
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
cron.schedule(" */25 * * * *", async () => {
  // catch: a failed run must not become an unhandled rejection; the next run retries
  try {
    await AppointmentService.cancelUnpaidAppointment();
  } catch (error) {
    console.error("Cron (cancel unpaid appointments) failed:", error);
  }
});
app.use("/api/v1", IndexRoutes);

app.get("/", (req: Request, res: Response) => {
  res.send("Hello, TypeScript Express!");
});
app.use(globalErrorHandler);
app.use(notFound);
export default app;
