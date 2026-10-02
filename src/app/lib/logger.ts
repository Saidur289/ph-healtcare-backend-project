import { randomUUID } from "crypto";
import type { IncomingMessage, ServerResponse } from "http";
import pino from "pino";
import { pinoHttp } from "pino-http";

const isProduction = process.env.NODE_ENV === "production";

// Values that must never reach the logs, wherever they appear in a logged object
const REDACT_KEYS = ["password", "newPassword", "currentPassword", "token", "accessToken", "refreshToken", "otp", "email", "contactNumber"];

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isProduction ? "info" : "debug"),
  redact: {
    paths: [
      "req.headers.cookie",
      "req.headers.authorization",
      'res.headers["set-cookie"]',
      ...REDACT_KEYS.flatMap((key) => [key, `*.${key}`, `*.*.${key}`]),
    ],
    censor: "[redacted]",
  },
  // JSON lines in production (for the log platform), readable output locally
  ...(isProduction ? {} : { transport: { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" } } }),
});

// one log line per request with a request id (also sent back as X-Request-Id)
export const httpLogger = pinoHttp({
  logger,
  genReqId: (req: IncomingMessage, res: ServerResponse) => {
    const incoming = req.headers["x-request-id"];
    // accept a caller's id only if it looks like one (no log injection)
    const id = typeof incoming === "string" && /^[A-Za-z0-9-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    res.setHeader("X-Request-Id", id);
    return id;
  },
  // keep request logs small: method, path (no query string: it can carry search terms) and status
  serializers: {
    req: (req: { id: string; method: string; url: string }) => ({ id: req.id, method: req.method, path: req.url?.split("?")[0] }),
    res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
  },
  customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info"),
  autoLogging: { ignore: (req) => req.url === "/" },
});
