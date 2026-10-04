import { prisma } from "../../src/app/lib/prisma";

// Empties every table (keeps the migration history). Guarded: only ever runs on a test DB.
export const resetDatabase = async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (process.env.NODE_ENV !== "test" || (!["127.0.0.1", "localhost"].includes(url.hostname) && !url.pathname.includes("test"))) {
    throw new Error("resetDatabase refused: DATABASE_URL is not a local test database");
  }
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
};
