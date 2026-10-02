import { CorsOptions } from "cors";
import { NextFunction, Request, Response } from "express";
import { ipKeyGenerator, rateLimit, Options } from "express-rate-limit";
import { StatusCodes } from "http-status-codes";
import { envVars } from "../config/env";

const isProduction = envVars.NODE_ENV === "production";

// ---------------------------------------------------------------- CORS
// Exact origins only (never "*"). Local dev origins are added outside production.
export const allowedOrigins = new Set(
  [new URL(envVars.FRONTEND_URL).origin, ...(isProduction ? [] : ["http://localhost:3000", "http://localhost:3001"])].filter(Boolean),
);

export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // no Origin header: server-to-server (the Next.js server, Stripe, curl) -> CORS does not apply
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key", "X-Request-Id"],
  exposedHeaders: ["X-Request-Id"],
  maxAge: 600,
};

// ---------------------------------------------------------------- CSRF
// Cookies are SameSite=Lax. On top of that, a state-changing request that carries an
// Origin (or Referer) from a site that is not ours is refused. Browsers always send
// Origin on cross-site POST/PUT/PATCH/DELETE; requests without it come from servers.
const STATE_CHANGING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const originOf = (value?: string) => {
  try {
    return value ? new URL(value).origin : undefined;
  } catch {
    return "invalid";
  }
};
export const verifyOrigin = (req: Request, res: Response, next: NextFunction) => {
  if (!STATE_CHANGING.has(req.method)) return next();
  const origin = originOf(req.get("origin")) ?? originOf(req.get("referer"));
  if (!origin || allowedOrigins.has(origin)) return next();
  res.status(StatusCodes.FORBIDDEN).json({
    success: false,
    message: "Request blocked: it did not come from this site",
    errorSources: [{ path: "origin", message: "Cross-site request" }],
  });
};

// ---------------------------------------------------------------- rate limits
// In-memory counters: fine for one API instance. With several instances, pass a shared
// store (e.g. rate-limit-redis) to every limiter below so the limits are global.
const limitMessage = (message: string) => ({
  success: false,
  message,
  errorSources: [{ path: "rate-limit", message }],
});

const base = (options: Partial<Options>) =>
  rateLimit({
    standardHeaders: "draft-8",
    legacyHeaders: false,
    // rate limits are off for automated tests only (never in production)
    skip: () => !isProduction && process.env.RATE_LIMIT === "off",
    ...options,
  });

const ipKey = (req: Request) => ipKeyGenerator(req.ip ?? "unknown");
const emailKey = (req: Request) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase().slice(0, 254) : "";
  return email ? `email:${email}` : `ip:${ipKey(req)}`;
};
// the logged-in session (all users of one Next.js server share its IP), else the IP
const sessionKey = (req: Request) => {
  const session = req.cookies?.["better-auth.session_token"];
  return typeof session === "string" && session ? `session:${session.slice(0, 64)}` : `ip:${ipKey(req)}`;
};

// login, register, OTP: 5 per minute per email, and a looser cap per IP
export const authPerEmailLimiter = base({
  windowMs: 60 * 1000,
  limit: 5,
  keyGenerator: emailKey,
  message: limitMessage("Too many attempts for this email. Please wait a minute and try again."),
});
// Coarse flood guard. Every user reaches the API through the Next.js server (one IP)
// unless TRUST_PROXY is set behind a proxy that writes X-Forwarded-For, so this stays
// high; the per-email limit above is what protects accounts.
export const authPerIpLimiter = base({
  windowMs: 60 * 1000,
  limit: 100,
  keyGenerator: ipKey,
  message: limitMessage("Too many attempts from your network. Please wait a minute and try again."),
});

// forgot / reset password: 3 per 15 minutes per email
export const passwordResetLimiter = base({
  windowMs: 15 * 60 * 1000,
  limit: 3,
  keyGenerator: emailKey,
  message: limitMessage("Too many password reset requests. Please try again in 15 minutes."),
});

// whole API: 100 requests per minute per logged-in session. Anonymous requests (public
// doctor pages) share the Next.js server's IP, so their shared bucket is larger.
const hasSession = (req: Request) => typeof req.cookies?.["better-auth.session_token"] === "string";
export const apiLimiter = base({
  windowMs: 60 * 1000,
  limit: (req: Request) => (hasSession(req) ? 100 : 1000),
  keyGenerator: sessionKey,
  message: limitMessage("Too many requests. Please slow down."),
});

// booking / payment start: 10 per minute per session
export const bookingLimiter = base({
  windowMs: 60 * 1000,
  limit: 10,
  keyGenerator: sessionKey,
  message: limitMessage("Too many booking attempts. Please wait a minute."),
});
