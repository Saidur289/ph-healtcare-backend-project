import { Prisma } from "../../../generated/prisma/client";

// DoctorSchedules has a composite key (doctorId + scheduleId) and no "id" column
export const doctorScheduleSearchableFields = ["scheduleId", "doctorId"];
export const doctorScheduleFilterableFields = [
  "scheduleId",
  "doctorId",
  "isBooked",
  "createdAt",
  "updatedAt",
  "schedule.startDateTime",
  "schedule.endDateTime",
];
export const doctorScheduleIncludeConfig: Partial<
  Record<
    keyof Prisma.DoctorSchedulesInclude,
    Prisma.DoctorSchedulesInclude[keyof Prisma.DoctorSchedulesInclude]
  >
> = {
  doctor: {
    include: {
      user: true,
      appointments: true,
      specialties: true,
    },
  },
  schedule: true,
};
