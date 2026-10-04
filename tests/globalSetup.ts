// Starts a throwaway PostgreSQL for the whole test run (tests/helpers/throwawayPostgres.ts,
// no Docker) and applies the Prisma migrations.
// Set TEST_DATABASE_URL to use an existing, EMPTY test database instead (e.g. a CI service).
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import type { TestProject } from "vitest/node";
import { assertTestDatabase, startThrowawayPostgres } from "./helpers/throwawayPostgres";

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

const testEnv = parse(readFileSync(new URL("./test.env", import.meta.url)));

export default async function setup(project: TestProject) {
  const external = process.env.TEST_DATABASE_URL;
  const local = external ? undefined : await startThrowawayPostgres();
  const databaseUrl = external ?? local!.databaseUrl;
  try {
    assertTestDatabase(databaseUrl);
    // prisma.config.ts validates the full env, so pass the test values to the CLI
    execSync("npx prisma migrate deploy", {
      stdio: "pipe",
      env: { ...process.env, ...testEnv, DATABASE_URL: databaseUrl },
    });
  } catch (error) {
    local?.stop();
    throw error;
  }
  project.provide("databaseUrl", databaseUrl);

  return () => local?.stop();
}
