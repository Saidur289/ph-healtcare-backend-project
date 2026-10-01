import z from "zod";

const dateField = (label: string) =>
  z.string(`${label} is required`).refine((date) => !isNaN(Date.parse(date)), {
    message: `${label} must be a valid date`,
  });
const timeField = (label: string) =>
  z
    .string(`${label} is required`)
    .refine((time) => /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time), {
      message: `${label} must be in HH:mm format`,
    });

const toMinutes = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

// the service needs all four values to build the time slots, so none of them are optional
const scheduleShape = z
  .strictObject({
    startDate: dateField("Start date"),
    endDate: dateField("End date"),
    startTime: timeField("Start time"),
    endTime: timeField("End time"),
    // IANA name of the admin's time zone, e.g. "Asia/Dhaka" (default: CLINIC_TIME_ZONE)
    timeZone: z.string().min(1).max(64).optional(),
  })
  .refine((data) => Date.parse(data.endDate) >= Date.parse(data.startDate), {
    message: "End date must be on or after the start date",
    path: ["endDate"],
  })
  .refine((data) => toMinutes(data.endTime) > toMinutes(data.startTime), {
    message: "End time must be after the start time",
    path: ["endTime"],
  });

const createScheduleZodSchema = scheduleShape;
const updateScheduleZodSchema = scheduleShape;

export const ScheduleValidation = {
  createScheduleZodSchema,
  updateScheduleZodSchema,
};
