import z from "zod";
import { AppointmentStatus } from "../../../generated/prisma/enums";

const bookAppointmentZodSchema = z.strictObject({
  doctorId: z.uuid("A valid doctor id is required"),
  scheduleId: z.uuid("A valid schedule id is required"),
});

const changeAppointmentStatusZodSchema = z.strictObject({
  status: z.enum(
    [
      AppointmentStatus.INPROGRESS,
      AppointmentStatus.COMPLETED,
      AppointmentStatus.CANCELED,
      AppointmentStatus.NO_SHOW,
    ],
    "Status must be INPROGRESS, COMPLETED, CANCELED or NO_SHOW",
  ),
  reason: z.string().trim().min(1).max(300, "Reason must be at most 300 characters").optional(),
});

const rescheduleAppointmentZodSchema = z.strictObject({
  scheduleId: z.uuid("A valid schedule id is required"),
});

export const AppointmentValidation = {
  bookAppointmentZodSchema,
  changeAppointmentStatusZodSchema,
  rescheduleAppointmentZodSchema,
};
