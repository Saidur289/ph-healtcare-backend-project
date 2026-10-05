import "dotenv/config";
import { defineConfig } from "prisma/config";

// Only DATABASE_URL is read here (not the full app config), so `prisma generate` works in a build
// without the app's secrets. Commands that touch the database fail clearly when it is missing.
export default defineConfig({
  schema: "prisma/schema",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "postgresql://database-url-not-set/none",
  },
});
