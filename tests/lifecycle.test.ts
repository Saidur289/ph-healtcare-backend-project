// plan.md 13.8 / 13.9: health checks and graceful shutdown.
import express from "express";
import { AddressInfo } from "node:net";
import { describe, expect, it, vi } from "vitest";
import app from "../src/app";
import { createShutdown } from "../src/app/utils/lifecycle";
import { api } from "./helpers/http";

describe("health checks", () => {
  it("GET /health: the process is alive", async () => {
    const res = await api().get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("GET /ready: the database answers", async () => {
    const res = await api().get("/ready");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ready", database: "ok" });
  });
});

describe("graceful shutdown", () => {
  it("finishes in-flight requests, refuses new ones, stops cron + jobs, closes the DB, exits 0", async () => {
    // the real app behind a slow test route
    const outer = express();
    outer.get("/__slow", (_req, res) => setTimeout(() => res.json({ finished: true }), 400));
    outer.use(app);
    const server = outer.listen(0);
    await new Promise((r) => server.once("listening", r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const order: string[] = [];
    const exit = vi.fn();
    const shutdown = createShutdown({
      getServer: () => server,
      stopCron: () => order.push("cron"),
      stopJobs: async () => void order.push("jobs"),
      disconnect: async () => void order.push("db"),
      exit,
      log: { info: () => undefined, error: () => undefined },
    });

    const inFlight = fetch(`${base}/__slow`).then((r) => r.json());
    await new Promise((r) => setTimeout(r, 100));
    const done = shutdown("SIGTERM received", 0);

    // a new connection is refused while the old request is still running
    await expect(fetch(`${base}/health`)).rejects.toThrow();
    expect(await inFlight).toEqual({ finished: true });
    await done;
    expect(order).toEqual(["cron", "jobs", "db"]);
    expect(exit).toHaveBeenCalledWith(0);
    // calling it again (second signal) does not run it twice
    await shutdown("SIGINT received", 0);
    expect(exit).toHaveBeenCalledTimes(1);

    // the instance now reports itself not ready, so the host sends no more traffic
    const ready = await api().get("/ready");
    expect(ready.status).toBe(503);
    expect(ready.body.status).toBe("shutting-down");
  });

  it("forces the exit when something hangs", async () => {
    const exit = vi.fn();
    const shutdown = createShutdown({
      getServer: () => undefined,
      stopCron: () => undefined,
      stopJobs: () => new Promise(() => undefined), // never finishes
      disconnect: async () => undefined,
      exit,
      log: { info: () => undefined, error: () => undefined },
      timeoutMs: 100,
    });
    void shutdown("SIGTERM received", 0);
    await new Promise((r) => setTimeout(r, 250));
    expect(exit).toHaveBeenCalledWith(1);
  });
});
