import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { defineConfig } from "vitest/config";

// fake, test-only values (the real .env is never needed and never wins: dotenv does not override)
const testEnv = parse(readFileSync(new URL("./tests/test.env", import.meta.url)));

export default defineConfig({
  test: {
    environment: "node",
    env: testEnv,
    // starts a throwaway Postgres and applies the migrations once per run
    globalSetup: ["./tests/globalSetup.ts"],
    // mocks for email / Stripe network calls / video / cron + a DB reset before each file
    setupFiles: ["./tests/setup.ts"],
    // one database: test files run one after another
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/app/**/*.ts"],
      exclude: ["src/generated/**", "src/app/templates/**"],
      reporter: ["text-summary", "text", "html"],
      // plan.md 11.13: at least 80 % on the auth, appointment and payment services
      thresholds: {
        "src/app/module/auth/auth.service.ts": { lines: 80 },
        "src/app/module/appointment/appointment.service.ts": { lines: 80 },
        "src/app/module/payment/payment.service.ts": { lines: 80 },
      },
    },
  },
});
