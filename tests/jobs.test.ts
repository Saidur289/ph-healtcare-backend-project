// plan.md 12.3: the background job queue in Postgres (src/app/utils/jobQueue.ts).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/app/lib/prisma";
import { enqueueJob, registerJobHandler, retryDelayMs, runDueJobs } from "../src/app/utils/jobQueue";

const handled: string[] = [];
let failTimes = 0;

beforeEach(async () => {
  await prisma.job.deleteMany();
  handled.length = 0;
  failTimes = 0;
  // "email.send" stands in for any job type in these tests
  registerJobHandler("email.send", async ({ to }) => {
    if (failTimes > 0) {
      failTimes--;
      throw new Error("SMTP is down (test)");
    }
    handled.push(to);
  });
});

const mail = (to: string) => ({ to, subject: "s", templateName: "reminder", templateData: {} });

describe("job queue", () => {
  it("runs a queued job once and marks it DONE", async () => {
    await enqueueJob("email.send", mail("a@example.test"));
    expect(await runDueJobs()).toEqual({ done: 1, retry: 0, failed: 0 });
    expect(handled).toEqual(["a@example.test"]);
    expect((await prisma.job.findFirstOrThrow()).status).toBe("DONE");
    // nothing left to do
    expect(await runDueJobs()).toEqual({ done: 0, retry: 0, failed: 0 });
  });

  it("retries a failing job later, with exponential backoff", async () => {
    failTimes = 1;
    await enqueueJob("email.send", mail("b@example.test"));
    expect(await runDueJobs()).toEqual({ done: 0, retry: 1, failed: 0 });

    const job = await prisma.job.findFirstOrThrow();
    expect(job.status).toBe("PENDING");
    expect(job.attempts).toBe(1);
    expect(job.lastError).toMatch(/SMTP is down/);
    expect(job.runAt.getTime()).toBeGreaterThan(Date.now() + 25_000);
    // not due yet
    expect(await runDueJobs()).toEqual({ done: 0, retry: 0, failed: 0 });

    // time passes
    await prisma.job.update({ where: { id: job.id }, data: { runAt: new Date(Date.now() - 1000) } });
    expect(await runDueJobs()).toEqual({ done: 1, retry: 0, failed: 0 });
    expect(handled).toEqual(["b@example.test"]);
  });

  it("gives up after maxAttempts and logs it (FAILED)", async () => {
    failTimes = 99;
    await enqueueJob("email.send", mail("c@example.test"), { maxAttempts: 2 });
    expect((await runDueJobs()).retry).toBe(1);
    await prisma.job.updateMany({ data: { runAt: new Date(Date.now() - 1000) } });
    expect((await runDueJobs()).failed).toBe(1);
    const job = await prisma.job.findFirstOrThrow();
    expect(job.status).toBe("FAILED");
    expect(job.attempts).toBe(2);
  });

  it("backoff: 30 s, 1 min, 2 min ... at most 1 hour", () => {
    expect(retryDelayMs(1)).toBe(30_000);
    expect(retryDelayMs(2)).toBe(60_000);
    expect(retryDelayMs(3)).toBe(120_000);
    expect(retryDelayMs(20)).toBe(60 * 60_000);
  });

  it("a dedupe key queues the work only once", async () => {
    await enqueueJob("email.send", mail("d@example.test"), { dedupeKey: "same" });
    await enqueueJob("email.send", mail("d@example.test"), { dedupeKey: "same" });
    expect(await prisma.job.count()).toBe(1);
  });

  it("a job queued in a transaction that rolls back never exists", async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await enqueueJob("email.send", mail("e@example.test"), {}, tx);
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(await prisma.job.count()).toBe(0);
  });

  it("two workers at once never run the same job twice", async () => {
    for (let i = 0; i < 12; i++) await enqueueJob("email.send", mail(`w${i}@example.test`));
    const [a, b] = await Promise.all([runDueJobs(12), runDueJobs(12)]);
    expect(a.done + b.done).toBe(12);
    expect(new Set(handled).size).toBe(12);
    expect(handled).toHaveLength(12);
  });

  it("picks up a job whose worker died (stale lock)", async () => {
    await enqueueJob("email.send", mail("f@example.test"));
    await prisma.job.updateMany({ data: { status: "RUNNING", lockedAt: new Date(Date.now() - 11 * 60_000), attempts: 1 } });
    expect(await runDueJobs()).toEqual({ done: 1, retry: 0, failed: 0 });
    expect(handled).toEqual(["f@example.test"]);
  });

  it("does not touch a job another worker is running right now", async () => {
    await enqueueJob("email.send", mail("g@example.test"));
    await prisma.job.updateMany({ data: { status: "RUNNING", lockedAt: new Date() } });
    expect(await runDueJobs()).toEqual({ done: 0, retry: 0, failed: 0 });
  });

  it("an unknown job type is retried and finally FAILED, not lost", async () => {
    await prisma.job.create({ data: { type: "nope", payload: {}, maxAttempts: 1 } });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await runDueJobs()).failed).toBe(1);
    spy.mockRestore();
    expect((await prisma.job.findFirstOrThrow()).lastError).toMatch(/No handler/);
  });
});

describe("real handlers", () => {
  it("invoice.deliver assigns the invoice number", async () => {
    await import("../src/app/jobs/handlers");
    const { createAppointment, createDoctor, createPatient, createSlot } = await import("./helpers/factories");
    const doctor = await createDoctor();
    const patient = await createPatient();
    const slot = await createSlot(doctor.doctor.id, 24 * 60);
    const { payment } = await createAppointment({ patientId: patient.patient.id, doctorId: doctor.doctor.id, scheduleId: slot.id, paymentStatus: "PAID" });

    await enqueueJob("invoice.deliver", { paymentId: payment.id }, { dedupeKey: `invoice:${payment.id}` });
    expect((await runDueJobs()).done).toBe(1);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).invoiceNumber).toMatch(/^INV-\d{4}-\d{6}$/);
  });
});
