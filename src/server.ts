import { Server } from "http";
import cron from "node-cron";
import app from "./app";
import { envVars } from "./app/config/env";
import { prisma } from "./app/lib/prisma";
import { logger } from "./app/lib/logger";
import { seedSuperAdmin } from "./app/utils/seed";
import { startJobWorker, stopJobWorker } from "./app/utils/jobQueue";

let server: Server | undefined;
let isShuttingDown = false;

// Stop accepting requests, let in-flight ones finish, stop cron jobs, close the DB, then exit.
const shutdown = async (reason: string, exitCode: number) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info({ reason }, "shutting down");

  // force exit if something hangs
  const forceExit = setTimeout(() => {
    logger.error("shutdown timed out, forcing exit");
    process.exit(exitCode);
  }, 10_000);
  forceExit.unref();

  try {
    cron.getTasks().forEach((task) => task.stop());
    stopJobWorker();
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    await prisma.$disconnect();
    logger.info("server closed gracefully");
  } catch (error) {
    logger.error({ err: error }, "error during shutdown");
  } finally {
    process.exit(exitCode);
  }
};

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

// normal stop (Ctrl+C, docker stop, hosting restarts)
process.on("SIGTERM", () => void shutdown("SIGTERM received", 0));
process.on("SIGINT", () => void shutdown("SIGINT received", 0));

// a synchronous crash leaves the process in an unknown state: restart it
process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "uncaught exception");
  void shutdown("Uncaught exception", 1);
});

// a forgotten await/catch somewhere: log it loudly, but keep serving other users
process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "unhandled promise rejection");
});

bootstrap();
