// A throwaway PostgreSQL server for tests (unit tests and the end-to-end runner).
// No Docker: the `embedded-postgres` dev dependency installs the real Postgres binaries for
// this OS (@embedded-postgres/<os>-<arch>); we run initdb / pg_ctl from there directly.
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { arch, platform, tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";

const isWindows = platform() === "win32";

// a free TCP port, so a leftover server from an interrupted run can never get in the way
export const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });

// setup / reset code empties tables: refuse anything that is not local or clearly a test DB
export const assertTestDatabase = (databaseUrl: string) => {
  const url = new URL(databaseUrl);
  if (!["127.0.0.1", "localhost"].includes(url.hostname) && !url.pathname.includes("test")) {
    throw new Error(`Refusing to use ${url.hostname}${url.pathname} for tests: use a local test database`);
  }
};

export const startThrowawayPostgres = async (databaseName = "ph_test") => {
  const binaries = (await import(`@embedded-postgres/${isWindows ? "windows" : platform()}-${arch()}`)) as {
    initdb: string;
    pg_ctl: string;
    postgres: string;
  };
  if (!isWindows) [binaries.initdb, binaries.pg_ctl, binaries.postgres].forEach((bin) => chmodSync(bin, 0o755));

  const port = await freePort();
  const dataDir = mkdtempSync(path.join(tmpdir(), "ph-test-pg-"));
  // stdio "ignore": the background server would otherwise keep our output pipes open (pg_ctl logs to -l)
  const run = (bin: string, args: string[]) => execFileSync(bin, args, { stdio: "ignore", timeout: 60_000 });

  // trust auth: only reachable from 127.0.0.1, deleted after the run
  run(binaries.initdb, ["-D", dataDir, "-U", "postgres", "--auth=trust", "-E", "UTF8", "--no-instructions"]);
  const serverOptions = isWindows ? `-p ${port} -h 127.0.0.1` : `-p ${port} -h 127.0.0.1 -k ${dataDir}`;
  run(binaries.pg_ctl, ["start", "-D", dataDir, "-w", "-l", path.join(dataDir, "server.log"), "-o", serverOptions]);

  const client = new pg.Client({ connectionString: `postgresql://postgres@127.0.0.1:${port}/postgres` });
  await client.connect();
  await client.query(`CREATE DATABASE ${databaseName}`);
  await client.end();

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    // "immediate" also ends Postgres' worker processes; the data is thrown away anyway
    try {
      run(binaries.pg_ctl, ["stop", "-D", dataDir, "-m", "immediate", "-w"]);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  };
  return { databaseUrl: `postgresql://postgres:postgres@127.0.0.1:${port}/${databaseName}`, stop };
};
