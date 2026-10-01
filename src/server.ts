import { Server } from "http";
import cron from "node-cron";
import app from "./app";
import { envVars } from "./app/config/env";
import { prisma } from "./app/lib/prisma";
import { seedSuperAdmin } from "./app/utils/seed";

let server: Server | undefined;
let isShuttingDown = false;

// Stop accepting requests, let in-flight ones finish, stop cron jobs, close the DB, then exit.
const shutdown = async (reason: string, exitCode: number) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`${reason} - shutting down...`);

  // force exit if something hangs
  const forceExit = setTimeout(() => {
    console.error("Shutdown timed out, forcing exit");
    process.exit(exitCode);
  }, 10_000);
  forceExit.unref();

  try {
    cron.getTasks().forEach((task) => task.stop());
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    await prisma.$disconnect();
    console.log("Server closed gracefully.");
  } catch (error) {
    console.error("Error during shutdown:", error);
  } finally {
    process.exit(exitCode);
  }
};

const bootstrap = async () => {
  try {
    await seedSuperAdmin();
    server = app.listen(envVars.PORT, () => {
      console.log(`Server is running on http://localhost:${envVars.PORT}`);
    });
  } catch (error) {
    // fail loudly: a server without its super admin / DB should not keep running
    console.error("Failed to start server:", error);
    await shutdown("Startup failed", 1);
  }
};

// normal stop (Ctrl+C, docker stop, hosting restarts)
process.on("SIGTERM", () => void shutdown("SIGTERM received", 0));
process.on("SIGINT", () => void shutdown("SIGINT received", 0));

// a synchronous crash leaves the process in an unknown state: restart it
process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  void shutdown("Uncaught exception", 1);
});

// a forgotten await/catch somewhere: log it loudly, but keep serving other users
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

bootstrap();
