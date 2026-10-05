// Error tracking (plan.md 13.10) with personal data removed before anything leaves the server
// (10.8). Off unless SENTRY_DSN is set, so development and tests send nothing.
import { logger } from "./logger";
import * as Sentry from "@sentry/node";

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// headers that are safe and useful; everything else (cookies, authorization, ...) is dropped
const KEEP_HEADERS = new Set(["user-agent", "content-type", "x-request-id"]);
const SENSITIVE_KEYS = /pass|token|secret|otp|cookie|authorization|email|phone|contact|address|name|medic|health|instruction|report/i;

const maskEmails = (value: string) => value.replace(EMAIL, "[email]");

// recursively drop sensitive keys and mask email addresses in strings
const scrub = (value: unknown, depth = 0): unknown => {
  if (depth > 6) return "[…]";
  if (typeof value === "string") return maskEmails(value);
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SENSITIVE_KEYS.test(k) ? "[redacted]" : scrub(v, depth + 1)]),
    );
  }
  return value;
};

export const scrubEvent = <T extends Sentry.ErrorEvent>(event: T): T => {
  if (event.request) {
    const headers = Object.fromEntries(Object.entries(event.request.headers ?? {}).filter(([k]) => KEEP_HEADERS.has(k.toLowerCase())));
    event.request = {
      method: event.request.method,
      // path only: query strings can hold search terms or ids
      url: event.request.url?.split("?")[0],
      headers,
    };
  }
  // who it happened to: an id at most (no email, IP or name)
  if (event.user) event.user = event.user.id ? { id: String(event.user.id) } : undefined;
  if (event.message) event.message = maskEmails(event.message);
  event.exception?.values?.forEach((ex) => {
    if (ex.value) ex.value = maskEmails(ex.value);
  });
  if (event.extra) event.extra = scrub(event.extra) as T["extra"];
  if (event.contexts) event.contexts = scrub(event.contexts) as T["contexts"];
  event.breadcrumbs = event.breadcrumbs?.map((b) => ({ ...b, message: b.message ? maskEmails(b.message) : b.message, data: scrub(b.data) as Record<string, unknown> }));
  return event;
};

let enabled = false;

export const initErrorTracking = () => {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    release: process.env.SENTRY_RELEASE,
    // collect no personal data in the first place; beforeSend scrubs again (defense in depth)
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { allow: [...KEEP_HEADERS] },
      httpBodies: [],
      urlQueryParams: false,
    },
    // errors only (no performance tracing)
    tracesSampleRate: 0,
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (crumb) => (crumb.category === "console" ? null : crumb),
  });
  enabled = true;
};

// report an unexpected error (5xx, failed job, failed cron run, crash). Never throws.
export const reportError = (error: unknown, context: Record<string, unknown> = {}) => {
  if (!enabled) return;
  try {
    Sentry.withScope((scope) => {
      scope.setExtras(context);
      Sentry.captureException(error);
    });
  } catch {
    /* error tracking must never break the app */
  }
};

export const flushErrorTracking = (timeoutMs = 2000) => (enabled ? Sentry.flush(timeoutMs).then(() => undefined) : Promise.resolve());

// Alerts (plan.md 13.11): one structured error log line with an `alert` name, which the log
// platform / uptime service alerts on, plus a report to error tracking. Never throws.
export type TAlert = "webhook_failed" | "webhook_unmatched" | "payment_mismatch" | "cron_failed" | "job_failed" | "email_failed" | "server_error";

export const raiseAlert = (alert: TAlert, message: string, context: Record<string, unknown> = {}, error?: unknown) => {
  try {
    logger.error({ alert, ...context, ...(error ? { err: error } : {}) }, message);
    reportError(error ?? new Error(message), { alert, ...context });
  } catch {
    /* alerting must never break the app */
  }
};
