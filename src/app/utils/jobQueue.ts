import { raiseAlert } from "../lib/errorTracking";
// A small, durable job queue in Postgres (plan.md 12.3) for work that must not run inside a
// request: invoice / prescription PDFs, Cloudinary uploads and emails.
//
// - Durable: a job is a row, so it survives a restart. It can be queued inside the same
//   transaction as the change that needs it (no "paid but the invoice job got lost").
// - Safe with several servers: jobs are claimed with FOR UPDATE SKIP LOCKED; a job whose worker
//   died is picked up again after LOCK_TIMEOUT.
// - Retries with exponential backoff; after maxAttempts the job is FAILED and logged as an error.
// Works through Neon's connection pooler and needs no Redis.
import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";

export type TJobPayloads = {
  "invoice.deliver": { paymentId: string };
  "prescription.deliver": { prescriptionId: string; reason: "new" | "updated" };
  "email.send": { to: string; subject: string; templateName: string; templateData: Record<string, unknown> };
};
export type TJobType = keyof TJobPayloads;

type TJobRow = { id: string; type: string; payload: unknown; attempts: number; maxAttempts: number };
type THandler<T extends TJobType> = (payload: TJobPayloads[T]) => Promise<unknown>;
type TDbClient = Pick<Prisma.TransactionClient, "job">;

const LOCK_TIMEOUT_MS = 10 * 60 * 1000;
const BASE_RETRY_MS = 30 * 1000;
const MAX_RETRY_MS = 60 * 60 * 1000;

const handlers = new Map<string, THandler<TJobType>>();

export const registerJobHandler = <T extends TJobType>(type: T, handler: THandler<T>) => {
  handlers.set(type, handler as THandler<TJobType>);
};

// 30 s, 1 min, 2 min, ... at most 1 hour
export const retryDelayMs = (attempt: number) => Math.min(BASE_RETRY_MS * 2 ** Math.max(attempt - 1, 0), MAX_RETRY_MS);

// Queue a job. Pass a transaction client to queue it atomically with other changes.
// With a dedupeKey the job is queued at most once (later calls are ignored).
export const enqueueJob = async <T extends TJobType>(
  type: T,
  payload: TJobPayloads[T],
  options: { dedupeKey?: string; delayMs?: number; maxAttempts?: number } = {},
  db: TDbClient = prisma,
) => {
  const data = {
    type,
    payload: payload as Prisma.InputJsonValue,
    dedupeKey: options.dedupeKey,
    maxAttempts: options.maxAttempts ?? 5,
    runAt: new Date(Date.now() + (options.delayMs ?? 0)),
  };
  if (options.dedupeKey) {
    // skipDuplicates: an existing job with this key wins, inside a transaction too
    await db.job.createMany({ data: [data], skipDuplicates: true });
    return;
  }
  await db.job.create({ data });
};

// Claims due jobs (also ones whose worker died) without blocking other servers.
// The columns hold UTC without a time zone (Prisma), so compare with UTC "now", whatever
// the database session time zone is.
const claimJobs = (limit: number) =>
  prisma.$queryRaw<TJobRow[]>`
    UPDATE "jobs" SET "status" = 'RUNNING', "lockedAt" = (now() AT TIME ZONE 'UTC'), "attempts" = "attempts" + 1, "updatedAt" = (now() AT TIME ZONE 'UTC')
    WHERE "id" IN (
      SELECT "id" FROM "jobs"
      WHERE ("status" = 'PENDING' AND "runAt" <= (now() AT TIME ZONE 'UTC'))
         OR ("status" = 'RUNNING' AND "lockedAt" < (now() AT TIME ZONE 'UTC') - make_interval(secs => ${LOCK_TIMEOUT_MS / 1000}))
      ORDER BY "runAt"
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id", "type", "payload", "attempts", "maxAttempts"`;

const runJob = async (job: TJobRow) => {
  const handler = handlers.get(job.type);
  try {
    if (!handler) throw new Error(`No handler for job type "${job.type}"`);
    await handler(job.payload as never);
    await prisma.job.update({ where: { id: job.id }, data: { status: "DONE", lockedAt: null, lastError: null } });
    return "done" as const;
  } catch (error) {
    const message = (error as Error)?.message ?? String(error);
    if (job.attempts >= job.maxAttempts) {
      await prisma.job.update({ where: { id: job.id }, data: { status: "FAILED", lockedAt: null, lastError: message } });
      // a person decides what to do (the job row keeps the last error for 30 days)
      raiseAlert("job_failed", "background job failed permanently", { jobId: job.id, type: job.type, attempts: job.attempts }, error);
      return "failed" as const;
    }
    await prisma.job.update({
      where: { id: job.id },
      data: { status: "PENDING", lockedAt: null, lastError: message, runAt: new Date(Date.now() + retryDelayMs(job.attempts)) },
    });
    logger.warn({ jobId: job.id, type: job.type, attempts: job.attempts, err: message }, "background job failed, will retry");
    return "retry" as const;
  }
};

// Runs the jobs that are due now (one batch). Returns what happened, for tests and logs.
export const runDueJobs = async (limit = 10) => {
  const jobs = await claimJobs(limit);
  const results = { done: 0, retry: 0, failed: 0 };
  for (const job of jobs) results[await runJob(job)]++;
  return results;
};

// ---------------------------------------------------------------- the worker (server.ts)
let timer: NodeJS.Timeout | undefined;
let running = false;
let currentRun: Promise<void> | undefined;

export const startJobWorker = (intervalMs = 5_000) => {
  if (timer) return;
  timer = setInterval(async () => {
    if (running) return;
    running = true;
    currentRun = (async () => {
      try {
        // keep going while full batches come back, so a backlog drains quickly
        while (timer && (await runDueJobs(10).then((r) => r.done + r.retry + r.failed)) === 10);
      } catch (error) {
        logger.error({ err: error }, "job worker error");
      } finally {
        running = false;
      }
    })();
    await currentRun;
  }, intervalMs);
  timer.unref?.();
};

// stops polling and waits for the job that is running right now (graceful shutdown)
export const stopJobWorker = async () => {
  if (timer) clearInterval(timer);
  timer = undefined;
  await currentRun?.catch(() => undefined);
};
