import z from "zod";
import { AppointmentStatus } from "../../../generated/prisma/enums";

const bookAppointmentZodSchema = z.strictObject({
  doctorId: z.uuid("A valid doctor id is required"),
  scheduleId: z.uuid("A valid schedule id is required"),
});

const changeAppointmentStatusZodSchema = z.strictObject({
  status: z.enum(
    [
      AppointmentStatus.SCHEDULED,
      AppointmentStatus.INPROGRESS,
      AppointmentStatus.COMPLETED,
      AppointmentStatus.CANCELED,
    ],
    "Invalid appointment status",
  ),
});

export const AppointmentValidation = {
  bookAppointmentZodSchema,
  changeAppointmentStatusZodSchema,
};
