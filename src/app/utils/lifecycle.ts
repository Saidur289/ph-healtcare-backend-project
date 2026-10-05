// Process lifecycle: health checks (plan.md 13.8) and graceful shutdown (13.9).
import type { Server } from "http";
import type { Express, Request, Response } from "express";
import { prisma } from "../lib/prisma";

let shuttingDown = false;
export const isShuttingDown = () => shuttingDown;

const withTimeout = <T>(promise: Promise<T>, ms: number) =>
  Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms))]);

// GET /health: the process is alive (use as the liveness check).
// GET /ready:  the database answers and we are not shutting down (use as the readiness check:
//              the host stops sending traffic while it is 503). There is no Redis to check.
export const registerHealthRoutes = (app: Express) => {
  app.get("/health", (_req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ status: "ok", uptimeSeconds: Math.round(process.uptime()) });
  });
  app.get("/ready", async (_req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    if (shuttingDown) return res.status(503).json({ status: "shutting-down" });
    try {
      await withTimeout(prisma.$queryRaw`SELECT 1`, 3_000);
      res.json({ status: "ready", database: "ok" });
    } catch {
      // no error details: this endpoint is public
      res.status(503).json({ status: "not-ready", database: "unreachable" });
    }
  });
};

type TShutdownDeps = {
  getServer: () => Server | undefined;
  stopCron: () => void;
  stopJobs: () => Promise<void>;
  disconnect: () => Promise<void>;
  exit: (code: number) => void;
  log: { info: (obj: object, msg?: string) => void; error: (obj: object, msg?: string) => void };
  timeoutMs?: number;
};

// SIGTERM (a deploy / scale-down): stop taking new requests (and report not-ready), let
// in-flight requests and the running background job finish, stop the cron, close the
// database, exit. Forced exit if anything hangs.
export const createShutdown = (deps: TShutdownDeps) => {
  let started: Promise<void> | undefined;
  return (reason: string, exitCode: number) => {
    if (started) return started;
    shuttingDown = true;
    deps.log.info({ reason }, "shutting down");
    const forceExit = setTimeout(() => {
      deps.log.error({ reason }, "shutdown timed out, forcing exit");
      deps.exit(exitCode || 1);
    }, deps.timeoutMs ?? 10_000);
    forceExit.unref?.();

    started = (async () => {
      try {
        deps.stopCron();
        const server = deps.getServer();
        // close() stops accepting connections and resolves when in-flight requests are done
        const closed = server ? new Promise<void>((resolve) => server.close(() => resolve())) : Promise.resolve();
        server?.closeIdleConnections();
        await Promise.all([closed, deps.stopJobs()]);
        await deps.disconnect();
        deps.log.info({ reason }, "shut down cleanly");
      } catch (error) {
        deps.log.error({ err: error }, "error during shutdown");
      } finally {
        clearTimeout(forceExit);
        deps.exit(exitCode);
      }
    })();
    return started;
  };
};
