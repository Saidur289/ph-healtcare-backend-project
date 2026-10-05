import { Server } from "http";
import cron from "node-cron";
import app from "./app";
import { envVars } from "./app/config/env";
import { prisma } from "./app/lib/prisma";
import { logger } from "./app/lib/logger";
import { seedSuperAdmin } from "./app/utils/seed";
import { startJobWorker, stopJobWorker } from "./app/utils/jobQueue";
import { createShutdown } from "./app/utils/lifecycle";
import { flushErrorTracking, initErrorTracking, reportError } from "./app/lib/errorTracking";

// before anything else runs (does nothing without SENTRY_DSN)
initErrorTracking();

let server: Server | undefined;

// SIGTERM etc.: stop new requests, finish in-flight ones and the running job, stop cron, close the DB (utils/lifecycle.ts)
const shutdown = createShutdown({
  getServer: () => server,
  stopCron: () => cron.getTasks().forEach((task) => task.stop()),
  stopJobs: stopJobWorker,
  // send queued error reports, then close the database
  disconnect: () => flushErrorTracking().then(() => prisma.$disconnect()),
  exit: (code) => process.exit(code),
  log: logger,
});

const bootstrap = async () => {
  try {
    await seedSuperAdmin();
    server = app.listen(envVars.PORT, () => {
      logger.info(`server is running on port ${envVars.PORT}`);
    });
    // background jobs: PDFs, uploads, emails (utils/jobQueue.ts)
    startJobWorker();
  } catch (error) {
    // fail loudly: a server without its super admin / DB should not keep running
    logger.fatal({ err: error }, "failed to start server");
    await shutdown("Startup failed", 1);
  }
};

// normal stop (Ctrl+C, a deploy or restart by the host)
process.on("SIGTERM", () => void shutdown("SIGTERM received", 0));
process.on("SIGINT", () => void shutdown("SIGINT received", 0));

// a synchronous crash leaves the process in an unknown state: restart it
process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "uncaught exception");
  reportError(error, { kind: "uncaughtException" });
  void shutdown("Uncaught exception", 1);
});

// a forgotten await/catch somewhere: log it loudly, but keep serving other users
process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "unhandled promise rejection");
  reportError(reason, { kind: "unhandledRejection" });
});

bootstrap();
