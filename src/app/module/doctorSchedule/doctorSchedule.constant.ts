import { Prisma } from "../../../generated/prisma/client";

export const doctorScheduleSearchableFields = ["id", "scheduleId", "doctorId"];
export const doctorScheduleFilterableFields = ["id", "scheduleId", "doctorId", "isBooked", "createdAt", "updatedAt", "schedule.startDate", "schedule.endDate", "schedule.startDateTime", "schedule.endDateTime"];
export const doctorScheduleIncludeConfig: Partial<Record<keyof Prisma.DoctorSchedulesInclude, Prisma.DoctorSchedulesInclude[keyof Prisma.DoctorSchedulesInclude]>> = {
    doctor: {
        include: {
            user: true,
            appointments: true,
            specialties: true
        }
    },
    schedule: true
}