// plan.md 11.7: Stripe webhook with valid / invalid signature, duplicate event, late payment
// (auto refund), expired session, refund from the Stripe dashboard. Stripe network calls are
// mocked (tests/setup.ts); signatures are made and checked with the real Stripe library.
import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/app/lib/prisma";
import { AppointmentStatus, PaymentStatus } from "../src/generated/prisma/enums";
import { createAppointment, createDoctor, createPatient, createSlot } from "./helpers/factories";
import { api } from "./helpers/http";
import { stripeState } from "./helpers/mocks";

const stripe = new Stripe("sk_test_fake_key_for_automated_tests");

const sendEvent = (type: string, object: Record<string, unknown>, options: { id?: string; secret?: string; signature?: string | null } = {}) => {
  const payload = JSON.stringify({
    id: options.id ?? `evt_test_${randomUUID()}`,
    object: "event",
    type,
    api_version: "2025-01-01",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    data: { object },
  });
  const signature =
    options.signature === undefined
      ? stripe.webhooks.generateTestHeaderString({ payload, secret: options.secret ?? process.env.STRIPE_WEBHOOK_SECRET! })
      : options.signature;
  const req = api().post("/webhook").set("Content-Type", "application/json");
  if (signature !== null) req.set("stripe-signature", signature);
  return req.send(payload);
};

const paidSession = (paymentId: string, appointmentId: string, sessionId = `cs_test_${randomUUID()}`) => ({
  id: sessionId,
  object: "checkout.session",
  payment_status: "paid",
  status: "complete",
  payment_intent: `pi_test_${randomUUID()}`,
  metadata: { paymentId, appointmentId },
});

let doctorId: string;
let patientId: string;

beforeAll(async () => {
  doctorId = (await createDoctor()).doctor.id;
  patientId = (await createPatient()).patient.id;
});

const unpaidAppointment = async (options: { isPayLater?: boolean; startInMinutes?: number } = {}) => {
  const slot = await createSlot(doctorId, options.startInMinutes ?? 24 * 60);
  const checkoutSessionId = `cs_test_${randomUUID()}`;
  stripeState.sessions.set(checkoutSessionId, "open");
  return createAppointment({ patientId, doctorId, scheduleId: slot.id, isPayLater: options.isPayLater, checkoutSessionId });
};

describe("signature", () => {
  it("rejects a missing signature (400)", async () => {
    const res = await sendEvent("checkout.session.completed", {}, { signature: null });
    expect(res.status).toBe(400);
  });

  it("rejects a signature made with another secret (400) and changes nothing", async () => {
    const { appointment, payment } = await unpaidAppointment();
    const res = await sendEvent("checkout.session.completed", paidSession(payment.id, appointment.id), { secret: "whsec_not_the_real_secret" });
    expect(res.status).toBe(400);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe(PaymentStatus.UNPAID);
  });

  it("rejects a tampered payload (400)", async () => {
    const payload = JSON.stringify({ id: "evt_x", type: "checkout.session.completed", data: { object: {} } });
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET! });
    const res = await api()
      .post("/webhook")
      .set("Content-Type", "application/json")
      .set("stripe-signature", signature)
      .send(payload.replace("evt_x", "evt_y"));
    expect(res.status).toBe(400);
  });
});

describe("checkout.session.completed", () => {
  it("marks the payment and the appointment PAID", async () => {
    const { appointment, payment } = await unpaidAppointment();
    const session = paidSession(payment.id, appointment.id, payment.checkoutSessionId!);
    const res = await sendEvent("checkout.session.completed", session);
    expect(res.status).toBe(200);

    const after = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id }, include: { payment: true } });
    expect(after.paymentStatus).toBe(PaymentStatus.PAID);
    expect(after.payment?.status).toBe(PaymentStatus.PAID);
    expect(after.payment?.stripePaymentIntentId).toBe(session.payment_intent);
    expect(after.payment?.paidAt).not.toBeNull();
  });

  it("processes a duplicate event only once", async () => {
    const { appointment, payment } = await unpaidAppointment();
    const eventId = `evt_test_${randomUUID()}`;
    const session = paidSession(payment.id, appointment.id);
    expect((await sendEvent("checkout.session.completed", session, { id: eventId })).status).toBe(200);
    const paidAt = (await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).paidAt;

    const again = await sendEvent("checkout.session.completed", session, { id: eventId });
    expect(again.status).toBe(200);
    expect(again.body.data.message).toMatch(/already processed/);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).paidAt).toEqual(paidAt);
    expect(await prisma.stripeWebhookEvent.count({ where: { id: eventId } })).toBe(1);
  });

  it("refunds a payment that arrives after the appointment was cancelled", async () => {
    const { appointment, payment } = await unpaidAppointment();
    await prisma.appointment.update({ where: { id: appointment.id }, data: { status: AppointmentStatus.CANCELED, paymentStatus: PaymentStatus.EXPIRED } });
    await prisma.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.EXPIRED } });

    const session = paidSession(payment.id, appointment.id);
    const res = await sendEvent("checkout.session.completed", session);
    expect(res.status).toBe(200);
    expect(stripeState.refunds.at(-1)).toEqual({ payment_intent: session.payment_intent, idempotencyKey: `refund-${payment.id}` });
    const after = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(after.status).toBe(PaymentStatus.REFUNDED);
    expect(after.refundId).toBeTruthy();
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } })).status).toBe(AppointmentStatus.CANCELED);
  });

  it("a temporary failure answers 500 and the retry processes the event", async () => {
    const { appointment, payment } = await unpaidAppointment();
    await prisma.appointment.update({ where: { id: appointment.id }, data: { status: AppointmentStatus.CANCELED } });
    const eventId = `evt_test_${randomUUID()}`;
    const session = paidSession(payment.id, appointment.id);

    // the late-payment refund fails in Stripe -> AppError 502 -> Stripe should retry
    stripeState.failRefund = true;
    try {
      expect((await sendEvent("checkout.session.completed", session, { id: eventId })).status).toBe(500);
    } finally {
      stripeState.failRefund = false;
    }
    expect(await prisma.stripeWebhookEvent.count({ where: { id: eventId } })).toBe(0);
    expect((await sendEvent("checkout.session.completed", session, { id: eventId })).status).toBe(200);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe(PaymentStatus.REFUNDED);
  });

  it("an unknown payment is answered 200 (a retry would not help)", async () => {
    const res = await sendEvent("checkout.session.completed", paidSession(randomUUID(), randomUUID()));
    expect(res.status).toBe(200);
  });

  it("ignores other event types", async () => {
    const res = await sendEvent("customer.created", { id: "cus_test" });
    expect(res.status).toBe(200);
    expect(res.body.data.message).toMatch(/ignored/);
  });
});

describe("checkout.session.expired", () => {
  it("pay now: cancels the appointment and frees the slot", async () => {
    const { appointment, payment } = await unpaidAppointment();
    const res = await sendEvent("checkout.session.expired", { id: payment.checkoutSessionId, object: "checkout.session", status: "expired" });
    expect(res.status).toBe(200);
    const after = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id }, include: { payment: true } });
    expect(after.status).toBe(AppointmentStatus.CANCELED);
    expect(after.cancelledBy).toBe("SYSTEM");
    expect(after.payment?.status).toBe(PaymentStatus.EXPIRED);
    const slot = await prisma.doctorSchedules.findUniqueOrThrow({ where: { doctorId_scheduleId: { doctorId, scheduleId: appointment.scheduleId } } });
    expect(slot.isBooked).toBe(false);
  });

  it("pay later: keeps the appointment, the patient can start a new payment", async () => {
    const { appointment, payment } = await unpaidAppointment({ isPayLater: true });
    const res = await sendEvent("checkout.session.expired", { id: payment.checkoutSessionId, object: "checkout.session", status: "expired" });
    expect(res.status).toBe(200);
    const after = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id }, include: { payment: true } });
    expect(after.status).toBe(AppointmentStatus.SCHEDULED);
    expect(after.payment?.checkoutSessionId).toBeNull();
  });
});

describe("charge.refunded", () => {
  it("a full refund from the Stripe dashboard cancels a booked appointment and frees the slot", async () => {
    const { appointment, payment } = await unpaidAppointment();
    const paymentIntent = `pi_test_${randomUUID()}`;
    await prisma.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.PAID, stripePaymentIntentId: paymentIntent } });
    await prisma.appointment.update({ where: { id: appointment.id }, data: { paymentStatus: PaymentStatus.PAID } });

    const res = await sendEvent("charge.refunded", {
      id: `ch_test_${randomUUID()}`,
      object: "charge",
      refunded: true,
      payment_intent: paymentIntent,
      refunds: { data: [{ id: "re_dashboard_1" }] },
    });
    expect(res.status).toBe(200);
    const after = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id }, include: { payment: true } });
    expect(after.status).toBe(AppointmentStatus.CANCELED);
    expect(after.payment?.status).toBe(PaymentStatus.REFUNDED);
    expect(after.payment?.refundId).toBe("re_dashboard_1");
  });

  it("ignores a partial refund", async () => {
    const res = await sendEvent("charge.refunded", { id: "ch_partial", object: "charge", refunded: false, payment_intent: "pi_x" });
    expect(res.status).toBe(200);
    expect(res.body.data.message).toMatch(/Partial refund/);
  });
});
