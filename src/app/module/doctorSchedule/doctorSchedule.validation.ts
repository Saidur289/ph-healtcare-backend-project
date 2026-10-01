import z from "zod";

const createDoctorScheduleZodSchema = z.strictObject({
  scheduleIds: z
    .array(z.uuid("Each schedule id must be a valid UUID"))
    .min(1, "Select at least one schedule")
    .max(500, "Too many schedules at once"),
});

const updateDoctorScheduleZodSchema = z.strictObject({
  scheduleIds: z
    .array(
      z.strictObject({
        scheduleId: z.uuid("Schedule id must be a valid UUID"),
        shouldDelete: z.boolean("shouldDelete must be true or false"),
      }),
    )
    .min(1, "Provide at least one schedule change")
    .max(500, "Too many schedules at once"),
});

export const DoctorScheduleValidation = {
  createDoctorScheduleZodSchema,
  updateDoctorScheduleZodSchema,
};
