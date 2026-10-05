import { Prisma } from "../../../generated/prisma/client";
import { IQueryParams } from "../../interface/query.interface";
import { IRequestUser } from "../../interface/requestUser.interface";
import { prisma } from "../../lib/prisma";
import { StatusCodes } from "http-status-codes";
import AppError from "../../errorHelpers/AppError";
import { getDoctorProfileOrThrow } from "../../utils/profile";
import { QueryBuilder } from "../../utils/QueryBuilder";
import {
  doctorScheduleFilterableFields,
  doctorScheduleSearchableFields,
} from "./doctorSchedule.constant";
import {
  ICreateDoctorSchedule,
  IUpdateDoctorSchedule,
} from "./doctorSchedule.interface";

// every id must be an existing schedule that has not started yet
const assertFutureSchedules = async (scheduleIds: string[]) => {
  const uniqueIds = [...new Set(scheduleIds)];
  if (uniqueIds.length === 0) return;
  const schedules = await prisma.schedule.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, startDateTime: true },
  });
  if (schedules.length !== uniqueIds.length) {
    throw new AppError(StatusCodes.NOT_FOUND, "One or more schedules were not found");
  }
  if (schedules.some((schedule) => schedule.startDateTime.getTime() <= Date.now())) {
    throw new AppError(StatusCodes.BAD_REQUEST, "You can only choose future time slots");
  }
};

const createDoctorSchedule = async (
  user: IRequestUser,
  payload: ICreateDoctorSchedule,
) => {
  const doctorData = await getDoctorProfileOrThrow(user);
  await assertFutureSchedules(payload.scheduleIds);

  await prisma.doctorSchedules.createMany({
    data: payload.scheduleIds.map((scheduleId) => ({
      doctorId: doctorData.id,
      scheduleId,
    })),
    // slots the doctor already has are simply kept
    skipDuplicates: true,
  });
  const result = await prisma.doctorSchedules.findMany({
    where: { doctorId: doctorData.id, scheduleId: { in: payload.scheduleIds } },
    include: { schedule: true },
  });
  return result;
};
const getMyDoctorSchedules = async (
  user: IRequestUser,
  query: IQueryParams,
) => {
  const doctorData = await prisma.doctor.findUniqueOrThrow({
    where: { email: user.email },
  });
  const queryBuilder = new QueryBuilder<
    Prisma.DoctorSchedulesInclude,
    Prisma.DoctorSchedulesWhereInput,
    Prisma.DoctorSchedulesInclude
  >(
    prisma.doctorSchedules,
    query,
    {
      searchableFields: doctorScheduleSearchableFields,
      filterableFields: doctorScheduleFilterableFields,
      // the "pick schedules" modal loads all of the doctor's own slots at once
      maxLimit: 1000,
    },
  );
  const result = await queryBuilder
    .search()
    .filter()
    .paginate()
    .include({ schedule: true })
    .sort()
    .fields()
    // applied last, so a ?doctorId= query param can never show another doctor's slots
    .where({ doctorId: doctorData.id })
    .execute();
  return result;
};
const getAllDoctorSchedules = async (query: IQueryParams) => {
  const queryBuilder = new QueryBuilder<
    Prisma.DoctorSchedulesInclude,
    Prisma.DoctorSchedulesWhereInput,
    Prisma.DoctorSchedulesInclude
  >(prisma.doctorSchedules, query, {
    searchableFields: doctorScheduleSearchableFields,
    filterableFields: doctorScheduleFilterableFields,
  });
  const result = await queryBuilder
    .search()
    .filter()
    .paginate()
    // fixed include: the slot and a few doctor fields (not the doctor's user, appointments, ...)
    .include({
      schedule: true,
      doctor: { select: { id: true, name: true, email: true, profilePhoto: true } },
    })
    .sort()
    .fields()
    .execute();
  return result;
};
const getDoctorScheduleById = async (doctorId: string, scheduleId: string) => {
  const result = await prisma.doctorSchedules.findUniqueOrThrow({
    where: { doctorId_scheduleId: { doctorId, scheduleId } },
    include: { schedule: true, doctor: { select: { id: true, name: true, email: true, profilePhoto: true } } },
  });
  return result;
};
const assertNotBooked = async (doctorId: string, scheduleIds: string[]) => {
  if (scheduleIds.length === 0) return;
  const booked = await prisma.doctorSchedules.count({
    where: { doctorId, scheduleId: { in: scheduleIds }, isBooked: true },
  });
  if (booked > 0) {
    throw new AppError(
      StatusCodes.CONFLICT,
      `${booked} of these time slots already have an appointment and cannot be removed. Cancel the appointment first.`,
    );
  }
};

const updateDoctorSchedule = async (
  user: IRequestUser,
  payload: IUpdateDoctorSchedule,
) => {
  const doctorData = await getDoctorProfileOrThrow(user);
  const deleteIds = payload.scheduleIds
    .filter((schedule) => schedule.shouldDelete === true)
    .map((schedule) => schedule.scheduleId);
  const createIds = payload.scheduleIds
    .filter((schedule) => schedule.shouldDelete === false)
    .map((schedule) => schedule.scheduleId);

  await assertNotBooked(doctorData.id, deleteIds);
  await assertFutureSchedules(createIds);

  const result = await prisma.$transaction(async (tx) => {
    // isBooked: false again inside the transaction, in case a patient booked meanwhile
    const removed = await tx.doctorSchedules.deleteMany({
      where: {
        isBooked: false,
        doctorId: doctorData.id,
        scheduleId: { in: deleteIds },
      },
    });
    const added = await tx.doctorSchedules.createMany({
      data: createIds.map((scheduleId) => ({
        doctorId: doctorData.id,
        scheduleId,
      })),
      skipDuplicates: true,
    });
    return { removed: removed.count, added: added.count };
  });
  return result;
};

const deleteMyDoctorSchedule = async (id: string, user: IRequestUser) => {
  const doctorData = await getDoctorProfileOrThrow(user);
  const slot = await prisma.doctorSchedules.findUnique({
    where: { doctorId_scheduleId: { doctorId: doctorData.id, scheduleId: id } },
  });
  if (!slot) {
    throw new AppError(StatusCodes.NOT_FOUND, "This time slot is not in your schedule");
  }
  await assertNotBooked(doctorData.id, [id]);
  const result = await prisma.doctorSchedules.deleteMany({
    where: { isBooked: false, doctorId: doctorData.id, scheduleId: id },
  });
  if (result.count !== 1) {
    throw new AppError(StatusCodes.CONFLICT, "This time slot was just booked and cannot be removed");
  }
  return result;
};
export const DoctorScheduleService = {
  createDoctorSchedule,
  getMyDoctorSchedules,
  getAllDoctorSchedules,
  getDoctorScheduleById,
  updateDoctorSchedule,
  deleteMyDoctorSchedule,
};
