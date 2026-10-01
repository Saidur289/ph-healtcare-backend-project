import { StatusCodes } from "http-status-codes";
import { AppointmentStatus } from "../../../generated/prisma/enums";
import AppError from "../../errorHelpers/AppError";
import {
  minutes,
  NO_SHOW_AFTER_START_MIN,
  PATIENT_CHANGE_UNTIL_BEFORE_START_MIN,
  START_ALLOWED_BEFORE_MIN,
} from "./appointment.constant";

// Who is asking, relative to THIS appointment
export type TAppointmentActor = "OWNER_PATIENT" | "OWNER_DOCTOR" | "ADMIN" | "SYSTEM";

export type TTransitionContext = {
  actor: TAppointmentActor;
  isPaid: boolean;
  slotStart: Date;
  slotEnd: Date;
  now?: Date;
};

type TRule = {
  from: AppointmentStatus;
  to: AppointmentStatus;
  actors: TAppointmentActor[];
  // returns an error message when the change is not allowed right now
  check?: (ctx: TTransitionContext & { now: Date }) => string | null;
};

// The ONLY allowed status changes. Anything not listed is refused with 409.
//
// | From       | To         | Who                        | Rule                                    |
// |------------|------------|----------------------------|-----------------------------------------|
// | SCHEDULED  | INPROGRESS | own doctor                 | paid, from 10 min before start to end   |
// | INPROGRESS | COMPLETED  | own doctor                 | -                                       |
// | SCHEDULED  | CANCELED   | own patient                | until 2 h before start (refund if paid) |
// | SCHEDULED  | CANCELED   | own doctor / admin         | any time (refund if paid)               |
// | SCHEDULED  | CANCELED   | system (cron)              | unpaid and payment deadline passed      |
// | SCHEDULED  | NO_SHOW    | own doctor / admin         | from 15 min after start                 |
export const APPOINTMENT_TRANSITIONS: TRule[] = [
  {
    from: AppointmentStatus.SCHEDULED,
    to: AppointmentStatus.INPROGRESS,
    actors: ["OWNER_DOCTOR"],
    check: ({ isPaid, slotStart, slotEnd, now }) => {
      if (!isPaid) return "The appointment must be paid before it can start";
      if (now.getTime() < slotStart.getTime() - minutes(START_ALLOWED_BEFORE_MIN)) {
        return `You can start the consultation at most ${START_ALLOWED_BEFORE_MIN} minutes before it begins`;
      }
      if (now > slotEnd) return "This appointment slot is already over";
      return null;
    },
  },
  {
    from: AppointmentStatus.INPROGRESS,
    to: AppointmentStatus.COMPLETED,
    actors: ["OWNER_DOCTOR"],
  },
  {
    from: AppointmentStatus.SCHEDULED,
    to: AppointmentStatus.CANCELED,
    actors: ["OWNER_PATIENT", "OWNER_DOCTOR", "ADMIN", "SYSTEM"],
    check: ({ actor, slotStart, now }) => {
      if (
        actor === "OWNER_PATIENT" &&
        now.getTime() > slotStart.getTime() - minutes(PATIENT_CHANGE_UNTIL_BEFORE_START_MIN)
      ) {
        return `Appointments can be cancelled until ${PATIENT_CHANGE_UNTIL_BEFORE_START_MIN / 60} hours before they start`;
      }
      return null;
    },
  },
  {
    from: AppointmentStatus.SCHEDULED,
    to: AppointmentStatus.NO_SHOW,
    actors: ["OWNER_DOCTOR", "ADMIN"],
    check: ({ slotStart, now }) =>
      now.getTime() < slotStart.getTime() + minutes(NO_SHOW_AFTER_START_MIN)
        ? `No-show can be recorded from ${NO_SHOW_AFTER_START_MIN} minutes after the start time`
        : null,
  },
];

// Throws 403 (wrong person) or 409 (not possible now); returns quietly when allowed.
export const assertTransitionAllowed = (
  from: AppointmentStatus,
  to: AppointmentStatus,
  context: TTransitionContext,
) => {
  if (from === to) {
    throw new AppError(StatusCodes.CONFLICT, `Appointment is already ${to}`);
  }
  const rule = APPOINTMENT_TRANSITIONS.find((r) => r.from === from && r.to === to);
  if (!rule) {
    throw new AppError(StatusCodes.CONFLICT, `Status cannot change from ${from} to ${to}`);
  }
  if (!rule.actors.includes(context.actor)) {
    throw new AppError(StatusCodes.FORBIDDEN, "You are not allowed to make this change");
  }
  const problem = rule.check?.({ ...context, now: context.now ?? new Date() });
  if (problem) {
    throw new AppError(StatusCodes.CONFLICT, problem);
  }
};
