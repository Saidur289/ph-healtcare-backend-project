import { Prisma } from "../../../generated/prisma/client";
import { IQueryParams } from "../../interface/query.interface";
import { IRequestUser } from "../../interface/requestUser.interface";
import { prisma } from "../../lib/prisma";
import { QueryBuilder } from "../../utils/QueryBuilder";
import { doctorFilterableFields } from "../doctor/doctor.constant";
import {
  doctorScheduleIncludeConfig,
  doctorScheduleSearchableFields,
} from "./doctorSchedule.constant";
import {
  ICreateDoctorSchedule,
  IUpdateDoctorSchedule,
} from "./doctorSchedule.interface";

const createDoctorSchedule = async (
  user: IRequestUser,
  payload: ICreateDoctorSchedule,
) => {
  const doctorData = await prisma.doctor.findUniqueOrThrow({
    where: {
      email: user.email,
    },
  });

  const doctorScheduleData = payload.scheduleIds.map((scheduleId) => ({
    doctorId: doctorData.id,
    scheduleId,
  }));
  await prisma.doctorSchedules.createMany({ data: doctorScheduleData });
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
    { doctorId: doctorData.id, ...query },
    {
      searchableFields: doctorScheduleSearchableFields,
      filterableFields: doctorFilterableFields,
    },
  );
  const result = await queryBuilder
    .search()
    .filter()
    .paginate()
    .dynamicInclude(doctorScheduleIncludeConfig)
    .sort()
    .fields()
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
    filterableFields: doctorFilterableFields,
  });
  const result = await queryBuilder
    .search()
    .filter()
    .paginate()
    .dynamicInclude(doctorScheduleIncludeConfig)
    .sort()
    .fields()
    .execute();
  return result;
};
const getDoctorScheduleById = async (doctorId: string, scheduleId: string) => {
  const result = await prisma.doctorSchedules.findUniqueOrThrow({
    where: { doctorId_scheduleId: { doctorId, scheduleId } },
    include: { schedule: true, doctor: true },
  });
  return result;
};
const updateDoctorSchedule = async (
  user: IRequestUser,
  payload: IUpdateDoctorSchedule,
) => {
  const doctorData = await prisma.doctor.findUniqueOrThrow({
    where: { email: user.email },
  });
  const deleteIds = payload.scheduleIds
    .filter((schedule) => schedule.shouldDelete === true)
    .map((schedule) => schedule.scheduleId);
  const createIds = payload.scheduleIds
    .filter((schedule) => schedule.shouldDelete === false)
    .map((schedule) => schedule.scheduleId);
  const result = await prisma.$transaction(async (tx) => {
    await tx.doctorSchedules.deleteMany({
      where: {
        isBooked: false,
        doctorId: doctorData.id,
        scheduleId: { in: deleteIds },
      },
    });
    const doctorScheduleData = createIds.map((scheduleId) => ({
      doctorId: doctorData.id,
      scheduleId,
    }));
    const result = await tx.doctorSchedules.createMany({
      data: doctorScheduleData,
    });
    return result;
  });
  return result;
};
const deleteMyDoctorSchedule = async (id: string, user: IRequestUser) => {
  const doctorData = await prisma.doctor.findUniqueOrThrow({
    where: { email: user.email },
  });
  const result = await prisma.doctorSchedules.deleteMany({
    where: { isBooked: false, doctorId: doctorData.id, scheduleId: id },
  });
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
