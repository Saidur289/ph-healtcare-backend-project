// plan.md 11.6: every allowed and every refused status change.
// Part 1 checks the rules themselves (pure function, all combinations);
// part 2 checks that the HTTP endpoint applies them (incl. slot release and refunds).
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/app/lib/prisma";
import { AppointmentStatus, PaymentStatus } from "../src/generated/prisma/enums";
import {
  APPOINTMENT_TRANSITIONS,
  assertTransitionAllowed,
  TAppointmentActor,
} from "../src/app/module/appointment/appointment.stateMachine";
import { createAdmin, createAppointment, createDoctor, createPatient, createSlot } from "./helpers/factories";
import { API, api, login } from "./helpers/http";
import { stripeState } from "./helpers/mocks";

const MIN = 60_000;
const STATUSES = Object.values(AppointmentStatus);
const ACTORS: TAppointmentActor[] = ["OWNER_PATIENT", "OWNER_DOCTOR", "ADMIN", "SYSTEM"];

// the documented table (docs/booking.md); `when` = a moment at which the change is allowed
const ALLOWED: { from: AppointmentStatus; to: AppointmentStatus; actors: TAppointmentActor[] }[] = [
  { from: "SCHEDULED", to: "INPROGRESS", actors: ["OWNER_DOCTOR"] },
  { from: "INPROGRESS", to: "COMPLETED", actors: ["OWNER_DOCTOR"] },
  { from: "SCHEDULED", to: "CANCELED", actors: ["OWNER_PATIENT", "OWNER_DOCTOR", "ADMIN", "SYSTEM"] },
  { from: "SCHEDULED", to: "NO_SHOW", actors: ["OWNER_DOCTOR", "ADMIN"] },
];

const errorOf = (fn: () => void) => {
  try {
    fn();
    return null;
  } catch (error) {
    return error as { statusCode: number; message: string };
  }
};

describe("transition rules (every combination)", () => {
  it("the code allows exactly the documented transitions", () => {
    const fromCode = APPOINTMENT_TRANSITIONS.map((r) => `${r.from}->${r.to}:${[...r.actors].sort().join(",")}`).sort();
    const fromDocs = ALLOWED.map((r) => `${r.from}->${r.to}:${[...r.actors].sort().join(",")}`).sort();
    expect(fromCode).toEqual(fromDocs);
  });

  // a moment where every time rule passes: paid, 5 minutes into the slot... except NO_SHOW (15 min after start)
  const slotStart = new Date("2030-01-01T10:00:00Z");
  const slotEnd = new Date("2030-01-01T10:30:00Z");
  const goodTime = (to: AppointmentStatus) =>
    to === "NO_SHOW" ? new Date(slotStart.getTime() + 20 * MIN) : to === "CANCELED" ? new Date(slotStart.getTime() - 3 * 60 * MIN) : new Date(slotStart.getTime() + 5 * MIN);

  for (const from of STATUSES) {
    for (const to of STATUSES) {
      for (const actor of ACTORS) {
        const rule = ALLOWED.find((r) => r.from === from && r.to === to);
        const expected = from === to || !rule ? 409 : !rule.actors.includes(actor) ? 403 : null;
        it(`${from} -> ${to} by ${actor}: ${expected ?? "allowed"}`, () => {
          const error = errorOf(() =>
            assertTransitionAllowed(from, to, { actor, isPaid: true, slotStart, slotEnd, now: goodTime(to) }),
          );
          expect(error?.statusCode ?? null).toBe(expected);
        });
      }
    }
  }
});

describe("time and payment rules", () => {
  const slotStart = new Date("2030-01-01T10:00:00Z");
  const slotEnd = new Date("2030-01-01T10:30:00Z");
  const at = (minutesFromStart: number) => new Date(slotStart.getTime() + minutesFromStart * MIN);
  const check = (to: AppointmentStatus, actor: TAppointmentActor, now: Date, isPaid = true) =>
    errorOf(() => assertTransitionAllowed("SCHEDULED", to, { actor, isPaid, slotStart, slotEnd, now }))?.statusCode ?? null;

  it("start: only when paid, from 10 minutes before the start until the slot ends", () => {
    expect(check("INPROGRESS", "OWNER_DOCTOR", at(0), false)).toBe(409);
    expect(check("INPROGRESS", "OWNER_DOCTOR", at(-11))).toBe(409);
    expect(check("INPROGRESS", "OWNER_DOCTOR", at(-10))).toBeNull();
    expect(check("INPROGRESS", "OWNER_DOCTOR", at(29))).toBeNull();
    expect(check("INPROGRESS", "OWNER_DOCTOR", at(31))).toBe(409);
  });

  it("patient cancel: until 2 hours before the start; doctor/admin any time", () => {
    expect(check("CANCELED", "OWNER_PATIENT", at(-121))).toBeNull();
    expect(check("CANCELED", "OWNER_PATIENT", at(-119))).toBe(409);
    expect(check("CANCELED", "OWNER_DOCTOR", at(-1))).toBeNull();
    expect(check("CANCELED", "ADMIN", at(-1))).toBeNull();
  });

  it("no-show: from 15 minutes after the start", () => {
    expect(check("NO_SHOW", "OWNER_DOCTOR", at(14))).toBe(409);
    expect(check("NO_SHOW", "OWNER_DOCTOR", at(15))).toBeNull();
    expect(check("NO_SHOW", "ADMIN", at(16))).toBeNull();
  });
});

describe("PATCH /appointments/change-appointment-status/:id", () => {
  let doctor: Awaited<ReturnType<typeof createDoctor>>;
  let patient: Awaited<ReturnType<typeof createPatient>>;
  let cookies: { doctor: string; patient: string; admin: string };

  beforeAll(async () => {
    doctor = await createDoctor();
    patient = await createPatient();
    const admin = await createAdmin();
    cookies = {
      doctor: await login(doctor.email, doctor.password),
      patient: await login(patient.email, patient.password),
      admin: await login(admin.email, admin.password),
    };
  });

  const change = (cookie: string, id: string, status: string) =>
    api().patch(`${API}/appointments/change-appointment-status/${id}`).set("Cookie", cookie).send({ status });
  const appointmentAt = async (startInMinutes: number, paymentStatus: PaymentStatus = PaymentStatus.PAID, status: AppointmentStatus = AppointmentStatus.SCHEDULED) => {
    const slot = await createSlot(doctor.doctor.id, startInMinutes);
    return createAppointment({ patientId: patient.patient.id, doctorId: doctor.doctor.id, scheduleId: slot.id, paymentStatus, status });
  };

  it("doctor: start -> complete", async () => {
    const { appointment } = await appointmentAt(5);
    expect((await change(cookies.doctor, appointment.id, "INPROGRESS")).status).toBe(200);
    expect((await change(cookies.doctor, appointment.id, "COMPLETED")).status).toBe(200);
    const done = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(done.status).toBe(AppointmentStatus.COMPLETED);
    expect(done.startedAt).not.toBeNull();
    expect(done.completedAt).not.toBeNull();
    // a finished appointment can't change again
    expect((await change(cookies.doctor, appointment.id, "CANCELED")).status).toBe(409);
  });

  it("the patient can't start or complete a consultation (403)", async () => {
    const { appointment } = await appointmentAt(5);
    expect((await change(cookies.patient, appointment.id, "INPROGRESS")).status).toBe(403);
    expect((await change(cookies.patient, appointment.id, "COMPLETED")).status).toBe(409);
  });

  it("an unpaid appointment can't start", async () => {
    const { appointment } = await appointmentAt(5, PaymentStatus.UNPAID);
    expect((await change(cookies.doctor, appointment.id, "INPROGRESS")).status).toBe(409);
  });

  it("patient cancels an unpaid appointment: slot freed, no refund", async () => {
    const { appointment } = await appointmentAt(24 * 60, PaymentStatus.UNPAID);
    const refunds = stripeState.refunds.length;
    expect((await change(cookies.patient, appointment.id, "CANCELED")).status).toBe(200);
    const cancelled = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(cancelled.status).toBe(AppointmentStatus.CANCELED);
    expect(cancelled.cancelledBy).toBe("PATIENT");
    expect(stripeState.refunds.length).toBe(refunds);
    const slot = await prisma.doctorSchedules.findUniqueOrThrow({ where: { doctorId_scheduleId: { doctorId: doctor.doctor.id, scheduleId: appointment.scheduleId } } });
    expect(slot.isBooked).toBe(false);
  });

  it("doctor cancels a paid appointment: refunded in Stripe first, then cancelled", async () => {
    const { appointment, payment } = await appointmentAt(30);
    expect((await change(cookies.doctor, appointment.id, "CANCELED")).status).toBe(200);
    expect(stripeState.refunds.at(-1)?.idempotencyKey).toBe(`refund-${payment.id}`);
    const after = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id }, include: { payment: true } });
    expect(after.status).toBe(AppointmentStatus.CANCELED);
    expect(after.payment?.status).toBe(PaymentStatus.REFUNDED);
  });

  it("if the refund fails nothing changes (502)", async () => {
    const { appointment } = await appointmentAt(24 * 60);
    stripeState.failRefund = true;
    try {
      expect((await change(cookies.admin, appointment.id, "CANCELED")).status).toBe(502);
    } finally {
      stripeState.failRefund = false;
    }
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } })).status).toBe(AppointmentStatus.SCHEDULED);
  });

  it("patient can't cancel within 2 hours of the start", async () => {
    const { appointment } = await appointmentAt(60, PaymentStatus.UNPAID);
    expect((await change(cookies.patient, appointment.id, "CANCELED")).status).toBe(409);
  });

  it("no-show: refused before 15 minutes after the start, allowed after", async () => {
    const early = await appointmentAt(-5);
    expect((await change(cookies.doctor, early.appointment.id, "NO_SHOW")).status).toBe(409);
    const late = await appointmentAt(-20);
    expect((await change(cookies.admin, late.appointment.id, "NO_SHOW")).status).toBe(200);
  });

  it("rejects an unknown status (400)", async () => {
    const { appointment } = await appointmentAt(24 * 60);
    expect((await change(cookies.admin, appointment.id, "SCHEDULED")).status).toBe(400);
  });
});
