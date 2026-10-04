// plan.md 11.8: the "cancel unpaid" job cancels only expired unpaid appointments, and never
// releases a slot that someone else has booked again. Plus the reminder job (sent once).
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/app/lib/prisma";
import { AppointmentService } from "../src/app/module/appointment/appointment.service";
import { AppointmentReminder } from "../src/app/module/appointment/appointment.reminder";
import { AppointmentStatus, PaymentStatus } from "../src/generated/prisma/enums";
import { createAppointment, createDoctor, createPatient, createSlot } from "./helpers/factories";
import { outbox, stripeMocks } from "./helpers/mocks";

const MIN = 60_000;
const past = () => new Date(Date.now() - MIN);
const future = () => new Date(Date.now() + 30 * MIN);

let doctorId: string;

beforeEach(async () => {
  // every test starts without appointments (the job looks at the whole table)
  await prisma.payment.deleteMany();
  await prisma.appointment.deleteMany();
  doctorId = (await createDoctor()).doctor.id;
});

const slotBooked = async (scheduleId: string) =>
  (await prisma.doctorSchedules.findUniqueOrThrow({ where: { doctorId_scheduleId: { doctorId, scheduleId } } })).isBooked;

describe("cancel unpaid appointments", () => {
  it("cancels an unpaid appointment whose deadline passed: slot freed, payment EXPIRED, Stripe session expired", async () => {
    const patient = await createPatient();
    const slot = await createSlot(doctorId, 24 * 60);
    const sessionId = `cs_test_${randomUUID()}`;
    const { appointment } = await createAppointment({ patientId: patient.patient.id, doctorId, scheduleId: slot.id, paymentDeadline: past(), checkoutSessionId: sessionId });

    expect(await AppointmentService.cancelUnpaidAppointment()).toBe(1);
    const after = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id }, include: { payment: true } });
    expect(after.status).toBe(AppointmentStatus.CANCELED);
    expect(after.cancelledBy).toBe("SYSTEM");
    expect(after.paymentStatus).toBe(PaymentStatus.EXPIRED);
    expect(after.payment?.status).toBe(PaymentStatus.EXPIRED);
    expect(await slotBooked(slot.id)).toBe(false);
    expect(stripeMocks.expireSession).toHaveBeenCalledWith(sessionId);
  });

  it("leaves unpaid appointments before their deadline, paid ones, and finished ones alone", async () => {
    const patient = await createPatient();
    const notDue = await createAppointment({ patientId: patient.patient.id, doctorId, scheduleId: (await createSlot(doctorId, 24 * 60)).id, paymentDeadline: future() });
    const paid = await createAppointment({ patientId: patient.patient.id, doctorId, scheduleId: (await createSlot(doctorId, 26 * 60)).id, paymentDeadline: past(), paymentStatus: PaymentStatus.PAID });
    const inProgress = await createAppointment({ patientId: patient.patient.id, doctorId, scheduleId: (await createSlot(doctorId, 28 * 60)).id, paymentDeadline: past(), status: AppointmentStatus.INPROGRESS });

    expect(await AppointmentService.cancelUnpaidAppointment()).toBe(0);
    for (const { appointment } of [notDue, paid, inProgress]) {
      const after = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
      expect(after.status).toBe(appointment.status);
      expect(after.paymentStatus).toBe(appointment.paymentStatus);
      expect(await slotBooked(appointment.scheduleId)).toBe(true);
    }
  });

  it("does not release a slot that another patient has booked again", async () => {
    const first = await createPatient();
    const second = await createPatient();
    const slot = await createSlot(doctorId, 24 * 60);
    // the first booking expired earlier (already cancelled, its deadline long gone)...
    await createAppointment({ patientId: first.patient.id, doctorId, scheduleId: slot.id, status: AppointmentStatus.CANCELED, paymentStatus: PaymentStatus.EXPIRED, paymentDeadline: past() });
    // ...and someone else booked the same slot afterwards
    const rebooked = await createAppointment({ patientId: second.patient.id, doctorId, scheduleId: slot.id, paymentDeadline: future() });

    expect(await AppointmentService.cancelUnpaidAppointment()).toBe(0);
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: rebooked.appointment.id } })).status).toBe(AppointmentStatus.SCHEDULED);
    expect(await slotBooked(slot.id)).toBe(true);
  });

  it("two servers running the job at once cancel each appointment exactly once", async () => {
    const patient = await createPatient();
    for (let i = 0; i < 3; i++) {
      await createAppointment({ patientId: patient.patient.id, doctorId, scheduleId: (await createSlot(doctorId, (30 + i) * 60)).id, paymentDeadline: past() });
    }
    const [a, b] = await Promise.all([AppointmentService.cancelUnpaidAppointment(), AppointmentService.cancelUnpaidAppointment()]);
    expect(a + b).toBe(3);
    expect(await prisma.appointment.count({ where: { status: AppointmentStatus.CANCELED } })).toBe(3);
  });
});

describe("reminders", () => {
  it("sends the 24h reminder to patient and doctor once", async () => {
    const patient = await createPatient();
    const doctor = await prisma.doctor.findUniqueOrThrow({ where: { id: doctorId } });
    await createAppointment({ patientId: patient.patient.id, doctorId, scheduleId: (await createSlot(doctorId, 20 * 60)).id, paymentStatus: PaymentStatus.PAID });
    outbox.length = 0;

    expect(await AppointmentReminder.sendReminders("24h")).toBe(1);
    expect(outbox.map((m) => m.to).sort()).toEqual([patient.email, doctor.email].sort());
    // the next run sends nothing again
    expect(await AppointmentReminder.sendReminders("24h")).toBe(0);
    expect(outbox).toHaveLength(2);
  });

  it("the 1h reminder replaces a pending 24h reminder", async () => {
    const patient = await createPatient();
    const { appointment } = await createAppointment({ patientId: patient.patient.id, doctorId, scheduleId: (await createSlot(doctorId, 45)).id, paymentStatus: PaymentStatus.PAID });
    expect(await AppointmentReminder.sendReminders("24h")).toBe(0);
    expect(await AppointmentReminder.sendReminders("1h")).toBe(1);
    const after = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(after.reminder1hSentAt).not.toBeNull();
    expect(after.reminder24hSentAt).not.toBeNull();
  });
});
