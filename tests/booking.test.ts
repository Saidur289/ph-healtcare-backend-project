// plan.md 11.5: concurrent booking, past slot, deleted doctor, overlapping appointments,
// pay later (+ idempotency, unpaid limit, Stripe failure, reschedule).
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/app/lib/prisma";
import { AppointmentStatus, PaymentStatus, UserStatus } from "../src/generated/prisma/enums";
import { createAppointment, createDoctor, createPatient, createSlot } from "./helpers/factories";
import { API, api, login } from "./helpers/http";
import { stripeMocks, stripeState } from "./helpers/mocks";

const HOUR = 60;
const book = (cookie: string, doctorId: string, scheduleId: string, payLater = false) =>
  api()
    .post(`${API}/appointments/${payLater ? "book-appointment-with-pay-later" : "book-appointment"}`)
    .set("Cookie", cookie)
    .send({ doctorId, scheduleId });

let doctor: Awaited<ReturnType<typeof createDoctor>>;
let patient: Awaited<ReturnType<typeof createPatient>>;
let cookie: string;

beforeAll(async () => {
  doctor = await createDoctor({ fee: 1500 });
  patient = await createPatient();
  cookie = await login(patient.email, patient.password);
});

describe("pay now", () => {
  it("books a free slot: appointment + UNPAID payment + Stripe session, slot taken", async () => {
    const slot = await createSlot(doctor.doctor.id, 24 * HOUR);
    const res = await book(cookie, doctor.doctor.id, slot.id);
    expect(res.status).toBe(201);
    expect(res.body.data.paymentUrl).toMatch(/^https:\/\/checkout\.stripe\.test\//);

    const appointment = await prisma.appointment.findUniqueOrThrow({ where: { id: res.body.data.appointment.id }, include: { payment: true } });
    expect(appointment.status).toBe(AppointmentStatus.SCHEDULED);
    expect(appointment.paymentStatus).toBe(PaymentStatus.UNPAID);
    expect(appointment.isPayLater).toBe(false);
    expect(appointment.payment?.amount).toBe(1500);
    expect(appointment.payment?.checkoutSessionId).toBeTruthy();
    // pay now: about 31 minutes to pay
    const window = appointment.paymentDeadline!.getTime() - Date.now();
    expect(window).toBeGreaterThan(29 * 60_000);
    expect(window).toBeLessThan(32 * 60_000);
    // Stripe gets the amount in poisha
    const params = stripeMocks.createSession.mock.calls.at(-1)![0] as { line_items: { price_data: { unit_amount: number } }[] };
    expect(params.line_items[0].price_data.unit_amount).toBe(150_000);

    const doctorSlot = await prisma.doctorSchedules.findUniqueOrThrow({ where: { doctorId_scheduleId: { doctorId: doctor.doctor.id, scheduleId: slot.id } } });
    expect(doctorSlot.isBooked).toBe(true);

    // the same slot can't be booked again
    const other = await createPatient();
    expect((await book(await login(other.email, other.password), doctor.doctor.id, slot.id)).status).toBe(409);
  });

  it("20 parallel requests for one slot: exactly 1 succeeds", async () => {
    const slot = await createSlot(doctor.doctor.id, 30 * HOUR);
    const patients = await Promise.all(Array.from({ length: 20 }, () => createPatient()));
    const cookies = await Promise.all(patients.map((p) => login(p.email, p.password)));

    const results = await Promise.all(cookies.map((c) => book(c, doctor.doctor.id, slot.id)));
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(19);
    expect(await prisma.appointment.count({ where: { scheduleId: slot.id, status: { not: AppointmentStatus.CANCELED } } })).toBe(1);
  });

  it("refuses a slot in the past", async () => {
    const slot = await createSlot(doctor.doctor.id, -HOUR);
    const res = await book(cookie, doctor.doctor.id, slot.id);
    expect(res.status).toBe(400);
  });

  it("refuses a slot the doctor does not offer", async () => {
    const otherDoctor = await createDoctor();
    const slot = await createSlot(otherDoctor.doctor.id, 20 * HOUR);
    expect((await book(cookie, doctor.doctor.id, slot.id)).status).toBe(409);
  });

  it("refuses a deleted or blocked doctor (404)", async () => {
    const deleted = await createDoctor();
    const deletedSlot = await createSlot(deleted.doctor.id, 24 * HOUR);
    await prisma.doctor.update({ where: { id: deleted.doctor.id }, data: { isDeleted: true, deletedAt: new Date() } });
    expect((await book(cookie, deleted.doctor.id, deletedSlot.id)).status).toBe(404);

    const blocked = await createDoctor({ status: UserStatus.BLOCKED });
    const blockedSlot = await createSlot(blocked.doctor.id, 24 * HOUR);
    expect((await book(cookie, blocked.doctor.id, blockedSlot.id)).status).toBe(404);
  });

  it("refuses an overlapping appointment with another doctor", async () => {
    const p = await createPatient();
    const c = await login(p.email, p.password);
    const first = await createSlot(doctor.doctor.id, 40 * HOUR);
    expect((await book(c, doctor.doctor.id, first.id)).status).toBe(201);

    const otherDoctor = await createDoctor();
    // starts 10 minutes into the first appointment
    const overlapping = await prisma.schedule.create({
      data: { startDateTime: new Date(first.startDateTime.getTime() + 10 * 60_000), endDateTime: new Date(first.endDateTime.getTime() + 10 * 60_000) },
    });
    await prisma.doctorSchedules.create({ data: { doctorId: otherDoctor.doctor.id, scheduleId: overlapping.id } });
    const res = await book(c, otherDoctor.doctor.id, overlapping.id);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already have an appointment/);
  });

  it("allows at most 3 unpaid upcoming appointments", async () => {
    const p = await createPatient();
    const c = await login(p.email, p.password);
    for (let i = 0; i < 3; i++) {
      const slot = await createSlot(doctor.doctor.id, (50 + i) * HOUR);
      expect((await book(c, doctor.doctor.id, slot.id)).status).toBe(201);
    }
    const fourth = await createSlot(doctor.doctor.id, 60 * HOUR);
    expect((await book(c, doctor.doctor.id, fourth.id)).status).toBe(409);
  });

  it("the same Idempotency-Key returns the same booking", async () => {
    const p = await createPatient();
    const c = await login(p.email, p.password);
    const slot = await createSlot(doctor.doctor.id, 70 * HOUR);
    const send = () =>
      api()
        .post(`${API}/appointments/book-appointment`)
        .set("Cookie", c)
        .set("Idempotency-Key", "test-key-12345")
        .send({ doctorId: doctor.doctor.id, scheduleId: slot.id });
    const [a, b] = await Promise.all([send(), send()]);
    expect([a.status, b.status].sort()).toEqual([201, 201]);
    expect(a.body.data.appointment.id).toBe(b.body.data.appointment.id);
    expect(await prisma.appointment.count({ where: { patientId: p.patient.id } })).toBe(1);
  });

  it("gives the slot back when Stripe is down (502)", async () => {
    const p = await createPatient();
    const c = await login(p.email, p.password);
    const slot = await createSlot(doctor.doctor.id, 80 * HOUR);
    stripeState.failCheckout = true;
    try {
      expect((await book(c, doctor.doctor.id, slot.id)).status).toBe(502);
    } finally {
      stripeState.failCheckout = false;
    }
    const appointment = await prisma.appointment.findFirstOrThrow({ where: { patientId: p.patient.id } });
    expect(appointment.status).toBe(AppointmentStatus.CANCELED);
    const doctorSlot = await prisma.doctorSchedules.findUniqueOrThrow({ where: { doctorId_scheduleId: { doctorId: doctor.doctor.id, scheduleId: slot.id } } });
    expect(doctorSlot.isBooked).toBe(false);
    // and it can be booked again
    expect((await book(c, doctor.doctor.id, slot.id)).status).toBe(201);
  });
});

describe("pay later", () => {
  it("books without a Stripe session; payment is due 2 hours before the start", async () => {
    const p = await createPatient();
    const c = await login(p.email, p.password);
    const slot = await createSlot(doctor.doctor.id, 90 * HOUR);
    const calls = stripeMocks.createSession.mock.calls.length;
    const res = await book(c, doctor.doctor.id, slot.id, true);
    expect(res.status).toBe(201);
    expect(stripeMocks.createSession.mock.calls.length).toBe(calls);

    const appointment = await prisma.appointment.findUniqueOrThrow({ where: { id: res.body.data.appointment.id } });
    expect(appointment.isPayLater).toBe(true);
    expect(appointment.paymentDeadline!.getTime()).toBe(slot.startDateTime.getTime() - 2 * 60 * 60_000);

    // later: start the payment
    const pay = await api().post(`${API}/appointments/initiate-payment/${appointment.id}`).set("Cookie", c);
    expect(pay.status).toBe(200);
    expect(JSON.stringify(pay.body.data)).toMatch(/checkout\.stripe\.test/);
    expect(stripeMocks.createSession.mock.calls.length).toBe(calls + 1);
  });

  it("is refused for a slot less than 3 hours ahead", async () => {
    const slot = await createSlot(doctor.doctor.id, 2 * HOUR);
    const res = await book(cookie, doctor.doctor.id, slot.id, true);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Pay later/);
  });

  it("can't start a payment after the deadline", async () => {
    const p = await createPatient();
    const slot = await createSlot(doctor.doctor.id, 100 * HOUR);
    const { appointment } = await createAppointment({
      patientId: p.patient.id,
      doctorId: doctor.doctor.id,
      scheduleId: slot.id,
      isPayLater: true,
      paymentDeadline: new Date(Date.now() - 60_000),
    });
    const res = await api().post(`${API}/appointments/initiate-payment/${appointment.id}`).set("Cookie", await login(p.email, p.password));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});

describe("reschedule", () => {
  it("moves to another free slot of the same doctor and frees the old one", async () => {
    const p = await createPatient();
    const c = await login(p.email, p.password);
    const from = await createSlot(doctor.doctor.id, 110 * HOUR);
    const to = await createSlot(doctor.doctor.id, 112 * HOUR);
    const booked = await book(c, doctor.doctor.id, from.id, true);
    const id = booked.body.data.appointment.id;

    const res = await api().patch(`${API}/appointments/reschedule/${id}`).set("Cookie", c).send({ scheduleId: to.id });
    expect(res.status).toBe(200);
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id } })).scheduleId).toBe(to.id);
    const slots = await prisma.doctorSchedules.findMany({ where: { doctorId: doctor.doctor.id, scheduleId: { in: [from.id, to.id] } } });
    expect(slots.find((s) => s.scheduleId === from.id)?.isBooked).toBe(false);
    expect(slots.find((s) => s.scheduleId === to.id)?.isBooked).toBe(true);
  });

  it("is refused within 2 hours of the start", async () => {
    const p = await createPatient();
    const soon = await createSlot(doctor.doctor.id, HOUR);
    const later = await createSlot(doctor.doctor.id, 120 * HOUR);
    const { appointment } = await createAppointment({ patientId: p.patient.id, doctorId: doctor.doctor.id, scheduleId: soon.id });
    const res = await api()
      .patch(`${API}/appointments/reschedule/${appointment.id}`)
      .set("Cookie", await login(p.email, p.password))
      .send({ scheduleId: later.id });
    expect(res.status).toBe(409);
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } })).scheduleId).toBe(soon.id);
  });
});

describe("responses only carry what the app shows (plan.md 12.2)", () => {
  it("my-appointments / single appointment: no Stripe data, checkout links or private doctor fields", async () => {
    const p = await createPatient();
    const c = await login(p.email, p.password);
    const slot = await createSlot(doctor.doctor.id, 130 * HOUR);
    const { appointment } = await createAppointment({
      patientId: p.patient.id,
      doctorId: doctor.doctor.id,
      scheduleId: slot.id,
      paymentStatus: PaymentStatus.PAID,
      checkoutSessionId: "cs_test_secret_session",
      stripePaymentIntentId: "pi_test_secret_intent",
    });
    await prisma.doctor.update({ where: { id: doctor.doctor.id }, data: { contactNumber: "01700000000", address: "Private address 12" } });

    const list = await api().get(`${API}/appointments/my-appointments`).set("Cookie", c);
    const single = await api().get(`${API}/appointments/my-single-appointment/${appointment.id}`).set("Cookie", c);
    for (const res of [list, single]) {
      expect(res.status).toBe(200);
      const body = JSON.stringify(res.body);
      for (const secret of ["paymentGatewayData", "checkoutUrl", "cs_test_secret_session", "pi_test_secret_intent", "registrationNumber", "01700000000", "Private address 12"]) {
        expect(body, secret).not.toContain(secret);
      }
      // what the UI needs is still there
      expect(body).toContain(doctor.doctor.name);
      expect(body).toContain('"amount":1000');
    }
  });
});
