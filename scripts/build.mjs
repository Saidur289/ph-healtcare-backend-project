// Production build: type-check, then bundle src/ into dist/server.js (npm packages stay external).
// Plain `tsc` output can't run on Node directly (extensionless ESM imports, "bundler" resolution).
// Run with: npm run build && npm start
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { build } from "esbuild";

// the generated Prisma client is not committed (src/generated)
execSync("npx prisma generate", { stdio: "inherit" });
execSync("npx tsc --noEmit", { stdio: "inherit" });
rmSync("dist", { recursive: true, force: true });
await build({
  entryPoints: ["src/server.ts"],
  outfile: "dist/server.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  packages: "external",
  sourcemap: true,
  logLevel: "info",
});
