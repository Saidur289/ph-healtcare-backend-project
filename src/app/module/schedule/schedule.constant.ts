import { Prisma } from "../../../generated/prisma/client";

export const scheduleFilterableFields = ["id", "startDateTime", "endDateTime"];
// text search only works on string columns ("contains" on a DateTime breaks the query);
// filter dates with ranges instead, e.g. ?startDateTime[gte]=2026-10-01
export const scheduleSearchableFields = ["id"];
export const scheduleIncludeConfig: Partial<Record<keyof Prisma.ScheduleInclude, Prisma.ScheduleInclude[keyof Prisma.ScheduleInclude]>> = {
    appointments: {
        include: {
            doctor: true,
            patient: true,
            payment: true,
            prescription: true,
            review: true
        }
    },
    doctorSchedules: true
}

