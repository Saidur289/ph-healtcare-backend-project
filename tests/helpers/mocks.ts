// Shared state of the mocks installed in tests/setup.ts (one copy per test file).
import { vi } from "vitest";

// every email the app tried to send
export type TSentEmail = { to: string; subject: string; templateName: string; templateData: Record<string, unknown> };
export const outbox: TSentEmail[] = [];

// latest OTP emailed to an address (verification and password reset use the same template)
export const lastOtpFor = (email: string) => {
  const mail = [...outbox].reverse().find((m) => m.to === email && m.templateName === "otp");
  return mail?.templateData.otp as string | undefined;
};

// waits for the fire-and-forget OTP email (better-auth sends it without awaiting)
export const waitForOtp = async (email: string, timeoutMs = 5000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const otp = lastOtpFor(email);
    if (otp) return otp;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`No OTP email for ${email}`);
};

// ---------------------------------------------------------------- Stripe (network calls only)
// Webhook signature checks use the real Stripe library (they work offline).
let sessionSeq = 0;
export const stripeState = {
  failCheckout: false,
  failRefund: false,
  // session id -> "open" | "expired" | "complete"
  sessions: new Map<string, string>(),
  refunds: [] as { payment_intent: string; idempotencyKey?: string }[],
  // what checkout.sessions.list returns (payment reconciliation)
  completedSessions: [] as Record<string, unknown>[],
};

export const stripeMocks = {
  createSession: vi.fn(async (params: Record<string, unknown>) => {
    if (stripeState.failCheckout) throw new Error("Stripe is down (test)");
    const id = `cs_test_${++sessionSeq}_${Date.now()}`;
    stripeState.sessions.set(id, "open");
    return { id, url: `https://checkout.stripe.test/${id}`, status: "open", metadata: params.metadata };
  }),
  expireSession: vi.fn(async (id: string) => {
    stripeState.sessions.set(id, "expired");
    return { id, status: "expired" };
  }),
  retrieveSession: vi.fn(async (id: string) => ({
    id,
    status: stripeState.sessions.get(id) ?? "expired",
    url: `https://checkout.stripe.test/${id}`,
  })),
  listSessions: vi.fn(() => {
    const items = [...stripeState.completedSessions];
    return { async *[Symbol.asyncIterator]() { yield* items; } };
  }),
  createRefund: vi.fn(async (params: { payment_intent: string }, options?: { idempotencyKey?: string }) => {
    if (stripeState.failRefund) throw new Error("Stripe refund failed (test)");
    stripeState.refunds.push({ payment_intent: params.payment_intent, idempotencyKey: options?.idempotencyKey });
    return { id: `re_test_${stripeState.refunds.length}` };
  }),
};

export const resetMocks = () => {
  outbox.length = 0;
  stripeState.failCheckout = false;
  stripeState.failRefund = false;
  stripeState.sessions.clear();
  stripeState.refunds.length = 0;
  stripeState.completedSessions.length = 0;
  Object.values(stripeMocks).forEach((fn) => fn.mockClear());
};
