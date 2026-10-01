import {
  ICreateSchedulePayload,
  IUpdateSchedulePayload,
} from "./schedule.interface";
import {
  isValidTimeZone,
  nextCalendarDay,
  toCalendarDate,
  zonedTimeToUtc,
} from "./schedule.utils";
import {
  DEFAULT_CLINIC_TIME_ZONE,
  MAX_SCHEDULE_RANGE_DAYS,
  minutes,
  SLOT_MINUTES,
} from "../appointment/appointment.constant";
import { AppointmentStatus } from "../../../generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import { IQueryParams } from "../../interface/query.interface";
import { QueryBuilder } from "../../utils/QueryBuilder";
import { Prisma, Schedule } from "../../../generated/prisma/client";
import {
  scheduleFilterableFields,
  scheduleIncludeConfig,
  scheduleSearchableFields,
} from "./schedule.constant";
import AppError from "../../errorHelpers/AppError";
import { StatusCodes } from "http-status-codes";

const resolveTimeZone = (timeZone?: string) => {
  const zone = timeZone || DEFAULT_CLINIC_TIME_ZONE;
  if (!isValidTimeZone(zone)) {
    throw new AppError(StatusCodes.BAD_REQUEST, `Unknown time zone: ${zone}`);
  }
  return zone;
};

// Creates 30-minute slots between startTime and endTime on every day from startDate to endDate.
// Times are the clinic's wall-clock time in `timeZone` and are stored as UTC.
// Past slots and slots overlapping an existing slot are skipped.
const createSchedule = async (payload: ICreateSchedulePayload) => {
  const timeZone = resolveTimeZone(payload.timeZone);
  const firstDay = toCalendarDate(payload.startDate);
  const lastDay = toCalendarDate(payload.endDate);
  const days = (Date.parse(lastDay) - Date.parse(firstDay)) / minutes(24 * 60);
  if (days < 0) {
    throw new AppError(StatusCodes.BAD_REQUEST, "End date must be on or after the start date");
  }
  if (days > MAX_SCHEDULE_RANGE_DAYS) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      `You can create schedules for at most ${MAX_SCHEDULE_RANGE_DAYS} days at once`,
    );
  }

  // build every candidate slot
  const now = Date.now();
  const candidates: { startDateTime: Date; endDateTime: Date }[] = [];
  for (let day = firstDay; day <= lastDay; day = nextCalendarDay(day)) {
    const dayStart = zonedTimeToUtc(day, payload.startTime, timeZone).getTime();
    const dayEnd = zonedTimeToUtc(day, payload.endTime, timeZone).getTime();
    for (let start = dayStart; start + minutes(SLOT_MINUTES) <= dayEnd; start += minutes(SLOT_MINUTES)) {
      if (start <= now) continue; // never create slots in the past
      candidates.push({
        startDateTime: new Date(start),
        endDateTime: new Date(start + minutes(SLOT_MINUTES)),
      });
    }
  }
  if (candidates.length === 0) {
    throw new AppError(StatusCodes.BAD_REQUEST, "No future time slots in this range");
  }

  // skip anything that overlaps an existing slot (e.g. 09:00-09:30 vs 09:15-09:45)
  const rangeStart = candidates[0].startDateTime;
  const rangeEnd = candidates[candidates.length - 1].endDateTime;
  const existing = await prisma.schedule.findMany({
    where: { startDateTime: { lt: rangeEnd }, endDateTime: { gt: rangeStart } },
    select: { startDateTime: true, endDateTime: true },
  });
  const fresh = candidates.filter(
    (slot) =>
      !existing.some(
        (e) => e.startDateTime < slot.endDateTime && e.endDateTime > slot.startDateTime,
      ),
  );
  if (fresh.length > 0) {
    // skipDuplicates + the unique (start, end) index protect against a parallel request
    await prisma.schedule.createMany({ data: fresh, skipDuplicates: true });
  }
  return prisma.schedule.findMany({
    where: {
      OR: fresh.map((slot) => ({ startDateTime: slot.startDateTime, endDateTime: slot.endDateTime })),
    },
    orderBy: { startDateTime: "asc" },
  });
};
const getAllSchedules = async (query: IQueryParams) => {
  const queryBuilder = new QueryBuilder<
    Schedule,
    Prisma.ScheduleWhereInput,
    Prisma.ScheduleInclude
  >(prisma.schedule, query, {
    searchableFields: scheduleSearchableFields,
    filterableFields: scheduleFilterableFields,
  });
  const result = await queryBuilder
    .search()
    .filter()
    .paginate()
    .dynamicInclude(scheduleIncludeConfig)
    .sort()
    .fields()
    .execute();
  return result;
};
const getScheduleById = async (id: string) => {
  const result = await prisma.schedule.findFirst({
    where: {
      id,
    },
  });
  if (!result) {
    throw new AppError(StatusCodes.NOT_FOUND, "Schedule not found");
  }
  return result;
};
const assertNoActiveAppointments = async (scheduleId: string, action: string) => {
  const active = await prisma.appointment.count({
    where: {
      scheduleId,
      status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.INPROGRESS] },
    },
  });
  if (active > 0) {
    throw new AppError(
      StatusCodes.CONFLICT,
      `This schedule has ${active} active appointment(s) and cannot be ${action}`,
    );
  }
};

// Moves ONE slot. It must stay a future, 30-minute slot that overlaps no other slot.
const updateSchedule = async (id: string, payload: IUpdateSchedulePayload) => {
  const timeZone = resolveTimeZone(payload.timeZone);
  const existingSchedule = await prisma.schedule.findUnique({ where: { id } });
  if (!existingSchedule) {
    throw new AppError(StatusCodes.NOT_FOUND, "Schedule not found");
  }
  await assertNoActiveAppointments(id, "changed");

  const startDateTime = zonedTimeToUtc(toCalendarDate(payload.startDate), payload.startTime, timeZone);
  const endDateTime = zonedTimeToUtc(toCalendarDate(payload.endDate), payload.endTime, timeZone);
  if (endDateTime.getTime() - startDateTime.getTime() !== minutes(SLOT_MINUTES)) {
    throw new AppError(StatusCodes.BAD_REQUEST, `A schedule slot must be exactly ${SLOT_MINUTES} minutes`);
  }
  if (startDateTime.getTime() <= Date.now()) {
    throw new AppError(StatusCodes.BAD_REQUEST, "A schedule cannot start in the past");
  }
  const overlapping = await prisma.schedule.findFirst({
    where: {
      id: { not: id },
      startDateTime: { lt: endDateTime },
      endDateTime: { gt: startDateTime },
    },
    select: { id: true },
  });
  if (overlapping) {
    throw new AppError(StatusCodes.CONFLICT, "Another schedule already covers this time");
  }

  return prisma.schedule.update({
    where: { id },
    data: { startDateTime, endDateTime },
  });
};

// Past (completed/cancelled) appointments keep the schedule alive: the database refuses
// to delete it (onDelete: Restrict) and the error handler answers 409.
const deleteSchedule = async (id: string) => {
  const existingSchedule = await prisma.schedule.findUnique({ where: { id } });
  if (!existingSchedule) {
    throw new AppError(StatusCodes.NOT_FOUND, "Schedule not found");
  }
  await assertNoActiveAppointments(id, "deleted");
  return prisma.schedule.delete({ where: { id } });
};
export const ScheduleService = {
  createSchedule,
  getAllSchedules,
  getScheduleById,
  updateSchedule,
  deleteSchedule,
};
