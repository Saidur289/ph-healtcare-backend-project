import { StatusCodes } from "http-status-codes";
import { v7 as uuidv7 } from "uuid";
import AppError from "../../errorHelpers/AppError";
import { IRequestUser } from "../../interface/requestUser.interface";
import { prisma } from "../../lib/prisma";
import { ICreateBookAppointmentPayload } from "./appointment.interface";
import {
  AppointmentStatus,
  CancelledBy,
  PaymentStatus,
  Role,
  UserStatus,
} from "../../../generated/prisma/enums";
import { Prisma } from "../../../generated/prisma/client";
import { getPatientProfileOrThrow } from "../../utils/profile";
import {
  ACTIVE_APPOINTMENT_STATUSES,
  MAX_ACTIVE_UNPAID_PER_PATIENT,
  minutes,
  PATIENT_CHANGE_UNTIL_BEFORE_START_MIN,
  PAY_LATER_DUE_BEFORE_START_MIN,
  PAY_LATER_MIN_LEAD_MIN,
  PAY_NOW_WINDOW_MIN,
  START_ALLOWED_BEFORE_MIN,
} from "./appointment.constant";
import { assertVideoConfigured, createMeetingToken, ensureRoom } from "../video/daily";
import { assertTransitionAllowed, TAppointmentActor } from "./appointment.stateMachine";
import {
  createCheckoutSession,
  expireCheckoutSession,
  getOpenCheckoutUrl,
  refundCheckoutPayment,
} from "../payment/payment.stripe";

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

// interactive transactions wait for a free DB connection instead of failing at 2 s (P2028)
const BOOKING_TX_OPTIONS = { maxWait: 10_000, timeout: 15_000 };

const appointmentWithPayment = {
  payment: true,
  schedule: true,
  doctor: { select: { id: true, name: true, designation: true, profilePhoto: true } },
} satisfies Prisma.AppointmentInclude;

// ------------------------------------------------------------------ booking

// the earlier result of a booking request with the same Idempotency-Key, or null
const findByIdempotencyKey = async (patientId: string, idempotencyKey: string) => {
  const existing = await prisma.appointment.findUnique({
    where: { patientId_idempotencyKey: { patientId, idempotencyKey } },
    include: appointmentWithPayment,
  });
  if (!existing) return null;
  if (existing.status === AppointmentStatus.CANCELED) {
    // the first attempt with this key failed and was cancelled: the client must start a new attempt
    throw new AppError(
      StatusCodes.CONFLICT,
      "This booking attempt was cancelled. Please try booking again.",
    );
  }
  const paymentUrl =
    existing.paymentStatus === PaymentStatus.UNPAID
      ? await getOpenCheckoutUrl(existing.payment?.checkoutSessionId)
      : null;
  return { appointment: existing, payment: existing.payment, paymentUrl };
};

// One booking flow for "pay now" and "pay later".
// The slot is claimed with a conditional update inside one transaction, and the DB has a
// partial unique index (one active appointment per doctor slot) as a second safety net.
const createBooking = async (
  user: IRequestUser,
  payload: ICreateBookAppointmentPayload,
  options: { payLater: boolean; idempotencyKey?: string },
) => {
  const patient = await getPatientProfileOrThrow(user);
  const { idempotencyKey } = options;

  // a retried request (double click, network retry) returns the first result
  if (idempotencyKey) {
    const replay = await findByIdempotencyKey(patient.id, idempotencyKey);
    if (replay) return replay;
  }

  const doctor = await prisma.doctor.findFirst({
    where: {
      id: payload.doctorId,
      isDeleted: false,
      user: { status: UserStatus.ACTIVE, isDeleted: false },
    },
  });
  if (!doctor) {
    throw new AppError(StatusCodes.NOT_FOUND, "Doctor not found");
  }
  if (doctor.email === patient.email) {
    throw new AppError(StatusCodes.BAD_REQUEST, "You cannot book an appointment with yourself");
  }

  const schedule = await prisma.schedule.findUnique({ where: { id: payload.scheduleId } });
  if (!schedule) {
    throw new AppError(StatusCodes.NOT_FOUND, "Schedule not found");
  }
  const now = Date.now();
  if (schedule.startDateTime.getTime() <= now) {
    throw new AppError(StatusCodes.BAD_REQUEST, "This time slot is in the past");
  }
  if (
    options.payLater &&
    schedule.startDateTime.getTime() - now < minutes(PAY_LATER_MIN_LEAD_MIN)
  ) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      `Pay later is only available for appointments at least ${PAY_LATER_MIN_LEAD_MIN / 60} hours ahead. Please pay now.`,
    );
  }

  // a patient can't be in two appointments at the same time
  const overlapping = await prisma.appointment.findFirst({
    where: {
      patientId: patient.id,
      status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
      schedule: {
        startDateTime: { lt: schedule.endDateTime },
        endDateTime: { gt: schedule.startDateTime },
      },
    },
    select: { id: true },
  });
  if (overlapping) {
    throw new AppError(StatusCodes.CONFLICT, "You already have an appointment at this time");
  }

  const unpaidCount = await prisma.appointment.count({
    where: {
      patientId: patient.id,
      status: AppointmentStatus.SCHEDULED,
      paymentStatus: PaymentStatus.UNPAID,
    },
  });
  if (unpaidCount >= MAX_ACTIVE_UNPAID_PER_PATIENT) {
    throw new AppError(
      StatusCodes.CONFLICT,
      `You already have ${MAX_ACTIVE_UNPAID_PER_PATIENT} unpaid appointments. Please pay or cancel one first.`,
    );
  }

  // cheap early answer for an already taken slot (the transaction below is the real guard)
  const slot = await prisma.doctorSchedules.findUnique({
    where: { doctorId_scheduleId: { doctorId: doctor.id, scheduleId: schedule.id } },
    select: { isBooked: true },
  });
  if (!slot || slot.isBooked) {
    if (idempotencyKey) {
      const replay = await findByIdempotencyKey(patient.id, idempotencyKey);
      if (replay) return replay;
    }
    throw new AppError(StatusCodes.CONFLICT, "This time slot is no longer available");
  }

  const paymentDeadline = options.payLater
    ? new Date(schedule.startDateTime.getTime() - minutes(PAY_LATER_DUE_BEFORE_START_MIN))
    : new Date(now + minutes(PAY_NOW_WINDOW_MIN));

  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      // atomic claim: only one request can flip isBooked from false to true
      const claim = await tx.doctorSchedules.updateMany({
        where: { doctorId: doctor.id, scheduleId: schedule.id, isBooked: false },
        data: { isBooked: true },
      });
      if (claim.count !== 1) {
        throw new AppError(StatusCodes.CONFLICT, "This time slot is no longer available");
      }
      const appointment = await tx.appointment.create({
        data: {
          videoCallingId: String(uuidv7()),
          scheduleId: schedule.id,
          patientId: patient.id,
          doctorId: doctor.id,
          isPayLater: options.payLater,
          paymentDeadline,
          idempotencyKey,
        },
      });
      const payment = await tx.payment.create({
        data: {
          transactionId: String(uuidv7()),
          amount: doctor.appointmentFee,
          appointmentId: appointment.id,
        },
      });
      return { appointment, payment };
    }, BOOKING_TX_OPTIONS);
  } catch (error) {
    const isConflict =
      isUniqueViolation(error) ||
      (error instanceof AppError && error.statusCode === StatusCodes.CONFLICT);
    if (isConflict && idempotencyKey) {
      // the same request (same key) won the race a moment ago: return its result
      const replay = await findByIdempotencyKey(patient.id, idempotencyKey);
      if (replay) return replay;
    }
    if (isUniqueViolation(error)) {
      throw new AppError(StatusCodes.CONFLICT, "This time slot is no longer available");
    }
    throw error;
  }

  let paymentUrl: string | null = null;
  if (!options.payLater) {
    // Stripe is called AFTER the commit, never inside a DB transaction
    try {
      const { session } = await createCheckoutSession({
        appointmentId: created.appointment.id,
        paymentId: created.payment.id,
        doctorName: doctor.name,
        amount: doctor.appointmentFee,
        expiresAt: paymentDeadline,
      });
      paymentUrl = session.url;
      created.payment = await prisma.payment.update({
        where: { id: created.payment.id },
        data: { checkoutSessionId: session.id, checkoutUrl: session.url },
      });
    } catch (error) {
      // give the slot back: a booking without a way to pay is useless
      await cancelInTransaction(created.appointment.id, {
        cancelledBy: CancelledBy.SYSTEM,
        reason: "Payment session could not be created",
        paymentStatus: PaymentStatus.EXPIRED,
      });
      console.error("Stripe checkout failed:", (error as Error).message);
      throw new AppError(
        StatusCodes.BAD_GATEWAY,
        "The payment service is not available right now. Please try again.",
      );
    }
  }

  const appointment = await prisma.appointment.findUniqueOrThrow({
    where: { id: created.appointment.id },
    include: appointmentWithPayment,
  });
  return { appointment, payment: created.payment, paymentUrl };
};

const bookAppointment = (
  user: IRequestUser,
  payload: ICreateBookAppointmentPayload,
  idempotencyKey?: string,
) => createBooking(user, payload, { payLater: false, idempotencyKey });

const bookAppointmentWithPayLater = (
  payload: ICreateBookAppointmentPayload,
  user: IRequestUser,
  idempotencyKey?: string,
) => createBooking(user, payload, { payLater: true, idempotencyKey });

// ------------------------------------------------------------------ reading

const getMyAppointments = async (user: IRequestUser) => {
  if (user.role === Role.PATIENT) {
    const patient = await prisma.patient.findUnique({ where: { userId: user.userId } });
    if (!patient) throw new AppError(StatusCodes.NOT_FOUND, "Patient profile not found");
    return prisma.appointment.findMany({
      where: { patientId: patient.id },
      include: { doctor: true, schedule: true, payment: true, review: { select: { id: true, rating: true } }, prescription: { select: { id: true, pdfUrl: true } } },
      orderBy: { schedule: { startDateTime: "desc" } },
    });
  }
  const doctor = await prisma.doctor.findUnique({ where: { userId: user.userId } });
  if (!doctor) throw new AppError(StatusCodes.NOT_FOUND, "Doctor profile not found");
  return prisma.appointment.findMany({
    where: { doctorId: doctor.id },
    include: { patient: true, schedule: true, payment: true, review: { select: { id: true, rating: true } }, prescription: { select: { id: true, pdfUrl: true } } },
    orderBy: { schedule: { startDateTime: "desc" } },
  });
};

const getMySingleAppointment = async (user: IRequestUser, appointmentId: string) => {
  const where: Prisma.AppointmentWhereInput =
    user.role === Role.PATIENT
      ? { id: appointmentId, patient: { userId: user.userId } }
      : { id: appointmentId, doctor: { userId: user.userId } };
  const appointment = await prisma.appointment.findFirst({
    where,
    include: { doctor: true, patient: true, schedule: true, payment: true },
  });
  // someone else's id looks exactly like a missing one
  if (!appointment) throw new AppError(StatusCodes.NOT_FOUND, "Appointment not found");
  return appointment;
};

// ------------------------------------------------------------------ lifecycle

// Cancels an active appointment, frees its slot and updates the payment - all in one transaction.
// Returns false when the appointment was no longer SCHEDULED (someone else changed it first).
const cancelInTransaction = async (
  appointmentId: string,
  options: {
    cancelledBy: CancelledBy;
    reason?: string;
    paymentStatus?: PaymentStatus;
    refundId?: string;
  },
) =>
  prisma.$transaction(async (tx) => {
    const appointment = await tx.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    const updated = await tx.appointment.updateMany({
      where: { id: appointmentId, status: AppointmentStatus.SCHEDULED },
      data: {
        status: AppointmentStatus.CANCELED,
        cancelledAt: new Date(),
        cancelledBy: options.cancelledBy,
        cancelReason: options.reason,
        ...(options.paymentStatus ? { paymentStatus: options.paymentStatus } : {}),
      },
    });
    if (updated.count !== 1) return false;
    // the cancelled appointment held this slot (one active appointment per slot), so free it
    await tx.doctorSchedules.updateMany({
      where: { doctorId: appointment.doctorId, scheduleId: appointment.scheduleId },
      data: { isBooked: false },
    });
    if (options.paymentStatus) {
      await tx.payment.updateMany({
        where: { appointmentId },
        data: {
          status: options.paymentStatus,
          ...(options.refundId ? { refundId: options.refundId } : {}),
          ...(options.paymentStatus === PaymentStatus.REFUNDED ? { refundedAt: new Date() } : {}),
        },
      });
    }
    return true;
  });

const getActor = (
  user: IRequestUser,
  appointment: { patient: { userId: string }; doctor: { userId: string } },
): TAppointmentActor | null => {
  if (user.role === Role.ADMIN || user.role === Role.SUPER_ADMIN) return "ADMIN";
  if (user.role === Role.DOCTOR && appointment.doctor.userId === user.userId) return "OWNER_DOCTOR";
  if (user.role === Role.PATIENT && appointment.patient.userId === user.userId) return "OWNER_PATIENT";
  return null;
};

const ACTOR_TO_CANCELLED_BY: Record<TAppointmentActor, CancelledBy> = {
  OWNER_PATIENT: CancelledBy.PATIENT,
  OWNER_DOCTOR: CancelledBy.DOCTOR,
  ADMIN: CancelledBy.ADMIN,
  SYSTEM: CancelledBy.SYSTEM,
};

const changeAppointmentStatus = async (
  appointmentId: string,
  status: AppointmentStatus,
  user: IRequestUser,
  reason?: string,
) => {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      schedule: true,
      payment: true,
      doctor: { select: { userId: true } },
      patient: { select: { userId: true } },
    },
  });
  const actor = appointment ? getActor(user, appointment) : null;
  if (!appointment || !actor) {
    throw new AppError(StatusCodes.NOT_FOUND, "Appointment not found");
  }

  assertTransitionAllowed(appointment.status, status, {
    actor,
    isPaid: appointment.paymentStatus === PaymentStatus.PAID,
    slotStart: appointment.schedule.startDateTime,
    slotEnd: appointment.schedule.endDateTime,
  });

  if (status === AppointmentStatus.CANCELED) {
    let refundId: string | undefined;
    let paymentStatus: PaymentStatus = PaymentStatus.EXPIRED;
    if (appointment.paymentStatus === PaymentStatus.PAID && appointment.payment) {
      // refund first: if Stripe fails, nothing has changed yet and the user can retry
      refundId = await refundCheckoutPayment({
        paymentId: appointment.payment.id,
        paymentGatewayData: appointment.payment.paymentGatewayData,
      });
      paymentStatus = PaymentStatus.REFUNDED;
    }
    const cancelled = await cancelInTransaction(appointment.id, {
      cancelledBy: ACTOR_TO_CANCELLED_BY[actor],
      reason,
      paymentStatus,
      refundId,
    });
    if (!cancelled) {
      throw new AppError(StatusCodes.CONFLICT, "The appointment was changed by someone else. Please refresh.");
    }
    if (paymentStatus === PaymentStatus.EXPIRED) {
      await expireCheckoutSession(appointment.payment?.checkoutSessionId);
    }
  } else {
    const updated = await prisma.appointment.updateMany({
      // only if nobody changed the status in the meantime
      where: { id: appointment.id, status: appointment.status },
      data: {
        status,
        ...(status === AppointmentStatus.INPROGRESS ? { startedAt: new Date() } : {}),
        ...(status === AppointmentStatus.COMPLETED ? { completedAt: new Date() } : {}),
      },
    });
    if (updated.count !== 1) {
      throw new AppError(StatusCodes.CONFLICT, "The appointment was changed by someone else. Please refresh.");
    }
  }
  return prisma.appointment.findUniqueOrThrow({
    where: { id: appointment.id },
    include: { schedule: true, payment: true },
  });
};

// Move an upcoming appointment to another free slot of the same doctor (payment carries over)
const rescheduleAppointment = async (
  user: IRequestUser,
  appointmentId: string,
  newScheduleId: string,
) => {
  const patient = await getPatientProfileOrThrow(user);
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, patientId: patient.id },
    include: { schedule: true },
  });
  if (!appointment) throw new AppError(StatusCodes.NOT_FOUND, "Appointment not found");
  if (appointment.status !== AppointmentStatus.SCHEDULED) {
    throw new AppError(StatusCodes.CONFLICT, "Only upcoming appointments can be rescheduled");
  }
  const now = Date.now();
  if (now > appointment.schedule.startDateTime.getTime() - minutes(PATIENT_CHANGE_UNTIL_BEFORE_START_MIN)) {
    throw new AppError(
      StatusCodes.CONFLICT,
      `Appointments can be rescheduled until ${PATIENT_CHANGE_UNTIL_BEFORE_START_MIN / 60} hours before they start`,
    );
  }
  if (newScheduleId === appointment.scheduleId) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Please choose a different time slot");
  }
  const newSchedule = await prisma.schedule.findUnique({ where: { id: newScheduleId } });
  if (!newSchedule) throw new AppError(StatusCodes.NOT_FOUND, "Schedule not found");
  if (newSchedule.startDateTime.getTime() <= now) {
    throw new AppError(StatusCodes.BAD_REQUEST, "This time slot is in the past");
  }
  const isUnpaid = appointment.paymentStatus === PaymentStatus.UNPAID;
  if (
    isUnpaid &&
    appointment.isPayLater &&
    newSchedule.startDateTime.getTime() - now < minutes(PAY_LATER_MIN_LEAD_MIN)
  ) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Unpaid pay-later appointments can only move to a slot at least 3 hours ahead",
    );
  }
  const overlapping = await prisma.appointment.findFirst({
    where: {
      id: { not: appointment.id },
      patientId: patient.id,
      status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
      schedule: {
        startDateTime: { lt: newSchedule.endDateTime },
        endDateTime: { gt: newSchedule.startDateTime },
      },
    },
    select: { id: true },
  });
  if (overlapping) {
    throw new AppError(StatusCodes.CONFLICT, "You already have an appointment at this time");
  }

  try {
    await prisma.$transaction(async (tx) => {
      const claim = await tx.doctorSchedules.updateMany({
        where: { doctorId: appointment.doctorId, scheduleId: newSchedule.id, isBooked: false },
        data: { isBooked: true },
      });
      if (claim.count !== 1) {
        throw new AppError(StatusCodes.CONFLICT, "This time slot is no longer available");
      }
      const moved = await tx.appointment.updateMany({
        where: { id: appointment.id, status: AppointmentStatus.SCHEDULED },
        data: {
          scheduleId: newSchedule.id,
          ...(isUnpaid && appointment.isPayLater
            ? {
                paymentDeadline: new Date(
                  newSchedule.startDateTime.getTime() - minutes(PAY_LATER_DUE_BEFORE_START_MIN),
                ),
              }
            : {}),
          reminder24hSentAt: null,
          reminder1hSentAt: null,
        },
      });
      if (moved.count !== 1) {
        throw new AppError(StatusCodes.CONFLICT, "The appointment was changed by someone else. Please refresh.");
      }
      await tx.doctorSchedules.updateMany({
        where: { doctorId: appointment.doctorId, scheduleId: appointment.scheduleId },
        data: { isBooked: false },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(StatusCodes.CONFLICT, "This time slot is no longer available");
    }
    throw error;
  }
  return prisma.appointment.findUniqueOrThrow({
    where: { id: appointment.id },
    include: appointmentWithPayment,
  });
};

// ------------------------------------------------------------------ video call

// Returns a Daily.co room url + short-lived token for this appointment's patient or doctor.
// Allowed only when paid, SCHEDULED/INPROGRESS, and from 10 min before start until the slot ends.
// The doctor joining moves a SCHEDULED appointment to INPROGRESS.
const joinVideoCall = async (user: IRequestUser, appointmentId: string) => {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      schedule: true,
      doctor: { select: { userId: true, name: true } },
      patient: { select: { userId: true, name: true } },
    },
  });
  const actor = appointment ? getActor(user, appointment) : null;
  if (!appointment || (actor !== "OWNER_DOCTOR" && actor !== "OWNER_PATIENT")) {
    throw new AppError(StatusCodes.NOT_FOUND, "Appointment not found");
  }
  if (appointment.paymentStatus !== PaymentStatus.PAID) {
    throw new AppError(StatusCodes.CONFLICT, "The appointment must be paid before the call");
  }
  if (
    appointment.status !== AppointmentStatus.SCHEDULED &&
    appointment.status !== AppointmentStatus.INPROGRESS
  ) {
    throw new AppError(StatusCodes.CONFLICT, `This appointment is ${appointment.status}`);
  }
  const now = Date.now();
  const opensAt = appointment.schedule.startDateTime.getTime() - minutes(START_ALLOWED_BEFORE_MIN);
  const closesAt = appointment.schedule.endDateTime.getTime();
  if (now < opensAt) {
    throw new AppError(
      StatusCodes.CONFLICT,
      `The call opens ${START_ALLOWED_BEFORE_MIN} minutes before the appointment`,
    );
  }
  if (now > closesAt) {
    throw new AppError(StatusCodes.CONFLICT, "This appointment slot is already over");
  }

  // check the provider BEFORE changing anything, so a missing key never starts the appointment
  assertVideoConfigured();
  if (actor === "OWNER_DOCTOR" && appointment.status === AppointmentStatus.SCHEDULED) {
    await prisma.appointment.updateMany({
      where: { id: appointment.id, status: AppointmentStatus.SCHEDULED },
      data: { status: AppointmentStatus.INPROGRESS, startedAt: new Date() },
    });
  }

  // a little grace after the slot so a running consultation isn't cut mid-sentence
  const expiresAt = new Date(closesAt + minutes(15));
  const room = await ensureRoom(appointment.videoCallingId, expiresAt);
  const isDoctor = actor === "OWNER_DOCTOR";
  const token = await createMeetingToken({
    roomName: room.name,
    userName: isDoctor ? `Dr. ${appointment.doctor.name}` : appointment.patient.name,
    isOwner: isDoctor,
    notBefore: new Date(opensAt),
    expiresAt,
  });
  return {
    roomUrl: room.url,
    token,
    role: isDoctor ? "DOCTOR" : "PATIENT",
    expiresAt,
    slotStart: appointment.schedule.startDateTime,
    slotEnd: appointment.schedule.endDateTime,
  };
};

// ------------------------------------------------------------------ payment

const initiatePayment = async (appointmentId: string, user: IRequestUser) => {
  const patient = await getPatientProfileOrThrow(user);
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, patientId: patient.id },
    include: { doctor: true, payment: true },
  });
  if (!appointment || !appointment.payment) {
    throw new AppError(StatusCodes.NOT_FOUND, "Appointment not found");
  }
  if (appointment.status !== AppointmentStatus.SCHEDULED) {
    throw new AppError(StatusCodes.CONFLICT, "This appointment can no longer be paid");
  }
  if (appointment.paymentStatus === PaymentStatus.PAID) {
    throw new AppError(StatusCodes.CONFLICT, "Payment is already done");
  }
  if (appointment.paymentDeadline && appointment.paymentDeadline.getTime() <= Date.now()) {
    throw new AppError(StatusCodes.CONFLICT, "The payment deadline has passed");
  }

  // reuse a session that is still open
  const openUrl = await getOpenCheckoutUrl(appointment.payment.checkoutSessionId);
  if (openUrl) return { paymentUrl: openUrl };

  const { session, expiresAt } = await createCheckoutSession({
    appointmentId: appointment.id,
    paymentId: appointment.payment.id,
    doctorName: appointment.doctor.name,
    amount: appointment.payment.amount,
    expiresAt: appointment.paymentDeadline ?? new Date(Date.now() + minutes(PAY_NOW_WINDOW_MIN)),
  });
  await prisma.$transaction([
    prisma.payment.update({
      where: { id: appointment.payment.id },
      data: { checkoutSessionId: session.id, checkoutUrl: session.url },
    }),
    // never cancel while the patient is still allowed to pay in Stripe
    prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        paymentDeadline:
          !appointment.paymentDeadline || expiresAt > appointment.paymentDeadline
            ? expiresAt
            : appointment.paymentDeadline,
      },
    }),
  ]);
  return { paymentUrl: session.url };
};

// ------------------------------------------------------------------ background jobs

// fixed ids for Postgres advisory locks (one per job)
const CANCEL_UNPAID_LOCK_ID = 51001;

// Cancels SCHEDULED + UNPAID appointments whose payment deadline passed.
// The advisory lock makes sure only one server instance runs it at a time.
const cancelUnpaidAppointment = async () => {
  const sessionsToExpire: (string | null)[] = [];
  const cancelledCount = await prisma.$transaction(
    async (tx) => {
      const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(${CANCEL_UNPAID_LOCK_ID}) AS locked`;
      if (!locked) return 0;

      const due = await tx.appointment.findMany({
        where: {
          status: AppointmentStatus.SCHEDULED,
          paymentStatus: PaymentStatus.UNPAID,
          paymentDeadline: { lt: new Date() },
        },
        include: { payment: { select: { checkoutSessionId: true } } },
        take: 200,
      });
      let count = 0;
      for (const appointment of due) {
        const updated = await tx.appointment.updateMany({
          where: {
            id: appointment.id,
            status: AppointmentStatus.SCHEDULED,
            paymentStatus: PaymentStatus.UNPAID,
          },
          data: {
            status: AppointmentStatus.CANCELED,
            paymentStatus: PaymentStatus.EXPIRED,
            cancelledAt: new Date(),
            cancelledBy: CancelledBy.SYSTEM,
            cancelReason: "Not paid before the payment deadline",
          },
        });
        if (updated.count !== 1) continue;
        await tx.doctorSchedules.updateMany({
          where: { doctorId: appointment.doctorId, scheduleId: appointment.scheduleId },
          data: { isBooked: false },
        });
        // keep the payment row (history); just mark it expired
        await tx.payment.updateMany({
          where: { appointmentId: appointment.id, status: PaymentStatus.UNPAID },
          data: { status: PaymentStatus.EXPIRED },
        });
        sessionsToExpire.push(appointment.payment?.checkoutSessionId ?? null);
        count++;
      }
      return count;
    },
    { timeout: 30_000 },
  );
  // a late payment on an expired session is refunded by the webhook
  await Promise.all(sessionsToExpire.map((id) => expireCheckoutSession(id)));
  return cancelledCount;
};

export const AppointmentService = {
  cancelInTransaction,
  bookAppointment,
  getMyAppointments,
  getMySingleAppointment,
  changeAppointmentStatus,
  rescheduleAppointment,
  joinVideoCall,
  bookAppointmentWithPayLater,
  initiatePayment,
  cancelUnpaidAppointment,
};
