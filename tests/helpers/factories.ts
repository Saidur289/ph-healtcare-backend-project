// Test data builders. Users are created through better-auth (real password hashes),
// everything else directly with Prisma for speed.
import { randomUUID } from "node:crypto";
import { v7 as uuidv7 } from "uuid";
import { auth } from "../../src/app/lib/auth";
import { prisma } from "../../src/app/lib/prisma";
import { AppointmentStatus, PaymentStatus, Role, UserStatus } from "../../src/generated/prisma/enums";

export const TEST_PASSWORD = "Test#Password1";
const MIN = 60 * 1000;

let seq = 0;
export const uniqueEmail = (prefix = "user") => `${prefix}-${++seq}-${randomUUID().slice(0, 8)}@example.test`;

type TUserOptions = { email?: string; verified?: boolean; status?: UserStatus; name?: string };

const createAuthUser = async (role: Role, options: TUserOptions = {}) => {
  const email = options.email ?? uniqueEmail(role.toLowerCase());
  const name = options.name ?? `Test ${role.toLowerCase()}`;
  const { user } = await auth.api.signUpEmail({ body: { name, email, password: TEST_PASSWORD } });
  return prisma.user.update({
    where: { id: user.id },
    data: { role, emailVerified: options.verified ?? true, status: options.status ?? UserStatus.ACTIVE },
  });
};

export const createPatient = async (options: TUserOptions = {}) => {
  const user = await createAuthUser(Role.PATIENT, options);
  const patient = await prisma.patient.create({ data: { userId: user.id, name: user.name, email: user.email } });
  return { user, patient, email: user.email, password: TEST_PASSWORD };
};

export const createDoctor = async (options: TUserOptions & { fee?: number } = {}) => {
  const user = await createAuthUser(Role.DOCTOR, options);
  const doctor = await prisma.doctor.create({
    data: {
      userId: user.id,
      name: user.name,
      email: user.email,
      registrationNumber: `REG-${randomUUID().slice(0, 12)}`,
      gender: "FEMALE",
      appointmentFee: options.fee ?? 1000,
      qualification: "MBBS",
      designation: "Consultant",
    },
  });
  return { user, doctor, email: user.email, password: TEST_PASSWORD };
};

export const createAdmin = async (options: TUserOptions = {}) => {
  const user = await createAuthUser(Role.ADMIN, options);
  const admin = await prisma.admin.create({ data: { userId: user.id, name: user.name, email: user.email } });
  return { user, admin, email: user.email, password: TEST_PASSWORD };
};

export const createSuperAdmin = async (options: TUserOptions = {}) => {
  const user = await createAuthUser(Role.SUPER_ADMIN, options);
  const admin = await prisma.admin.create({ data: { userId: user.id, name: user.name, email: user.email } });
  return { user, admin, email: user.email, password: TEST_PASSWORD };
};

// a 30-minute slot starting `startInMinutes` from now (negative = in the past), offered by the doctor
let slotOffsetMs = 0;
export const createSlot = async (doctorId: string, startInMinutes: number, options: { isBooked?: boolean } = {}) => {
  // a few extra milliseconds keep (start, end) unique when two slots share the same offset
  const start = new Date(Date.now() + startInMinutes * MIN + ++slotOffsetMs);
  const schedule = await prisma.schedule.create({
    data: { startDateTime: start, endDateTime: new Date(start.getTime() + 30 * MIN) },
  });
  await prisma.doctorSchedules.create({
    data: { doctorId, scheduleId: schedule.id, isBooked: options.isBooked ?? false },
  });
  return schedule;
};

// an appointment written straight to the DB (for state machine / cron / webhook tests)
export const createAppointment = async (input: {
  patientId: string;
  doctorId: string;
  scheduleId: string;
  status?: AppointmentStatus;
  paymentStatus?: PaymentStatus;
  isPayLater?: boolean;
  paymentDeadline?: Date;
  amount?: number;
  checkoutSessionId?: string;
  stripePaymentIntentId?: string;
}) => {
  const status = input.status ?? AppointmentStatus.SCHEDULED;
  const paymentStatus = input.paymentStatus ?? PaymentStatus.UNPAID;
  if (status !== AppointmentStatus.CANCELED) {
    await prisma.doctorSchedules.update({
      where: { doctorId_scheduleId: { doctorId: input.doctorId, scheduleId: input.scheduleId } },
      data: { isBooked: true },
    });
  }
  const appointment = await prisma.appointment.create({
    data: {
      videoCallingId: uuidv7(),
      patientId: input.patientId,
      doctorId: input.doctorId,
      scheduleId: input.scheduleId,
      status,
      paymentStatus,
      isPayLater: input.isPayLater ?? false,
      paymentDeadline: input.paymentDeadline ?? new Date(Date.now() + 31 * MIN),
    },
  });
  const payment = await prisma.payment.create({
    data: {
      transactionId: uuidv7(),
      amount: input.amount ?? 1000,
      appointmentId: appointment.id,
      status: paymentStatus,
      checkoutSessionId: input.checkoutSessionId,
      stripePaymentIntentId: input.stripePaymentIntentId,
      ...(paymentStatus === PaymentStatus.PAID
        ? {
            paidAt: new Date(),
            paymentGatewayData: { payment_intent: input.stripePaymentIntentId ?? `pi_test_${randomUUID()}` },
          }
        : {}),
    },
  });
  return { appointment, payment };
};
