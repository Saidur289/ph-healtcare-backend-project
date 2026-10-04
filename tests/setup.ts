// Runs before every test file: replaces outside services with in-memory fakes and
// empties the database, so each file starts from a clean state.
import { afterAll, beforeAll, inject, vi } from "vitest";

// the throwaway database started by globalSetup.ts (random port), before any app module loads
process.env.DATABASE_URL = inject("databaseUrl");

// email: collected in `outbox` instead of being sent
vi.mock("../src/app/utils/email", async () => {
  const { outbox } = await import("./helpers/mocks");
  return {
    sendEmail: vi.fn(async (mail: { to: string; subject: string; templateName: string; templateData: Record<string, unknown> }) => {
      outbox.push(mail);
    }),
  };
});

// Stripe: real library (webhook signatures), fake network calls
vi.mock("../src/app/config/stripe.config", async () => {
  const { default: Stripe } = await import("stripe");
  const { stripeMocks } = await import("./helpers/mocks");
  const stripe = new Stripe("sk_test_fake_key_for_automated_tests");
  Object.assign(stripe.checkout.sessions, {
    create: stripeMocks.createSession,
    expire: stripeMocks.expireSession,
    retrieve: stripeMocks.retrieveSession,
    list: stripeMocks.listSessions,
  });
  Object.assign(stripe.refunds, { create: stripeMocks.createRefund });
  return { stripe };
});

// video calls: no Daily.co requests
vi.mock("../src/app/module/video/daily", () => ({
  assertVideoConfigured: vi.fn(),
  ensureRoom: vi.fn(async (name: string) => ({ name, url: `https://video.test/${name}` })),
  createMeetingToken: vi.fn(async () => "test-meeting-token"),
}));

// background jobs are called directly by the tests, never on a timer
vi.mock("node-cron", () => ({
  default: { schedule: vi.fn(() => ({ stop: vi.fn() })), getTasks: vi.fn(() => new Map()) },
}));

beforeAll(async () => {
  const { resetDatabase } = await import("./helpers/db");
  await resetDatabase();
  const { resetMocks } = await import("./helpers/mocks");
  resetMocks();
});

afterAll(async () => {
  const { prisma } = await import("../src/app/lib/prisma");
  await prisma.$disconnect();
});
