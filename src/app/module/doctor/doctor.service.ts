import { StatusCodes } from "http-status-codes";
import AppError from "../../errorHelpers/AppError";
import { prisma } from "../../lib/prisma";
import { IUpdateDoctorPayload } from "./doctor.interface";
import { QueryBuilder } from "../../utils/QueryBuilder";
import { IQueryParams } from "../../interface/query.interface";
import {
  doctorFilterableFields,
  doctorIncludeConfig,
  doctorPublicFilterableFields,
  doctorPublicSearchableFields,
  doctorPublicSelect,
  doctorPublicSortableFields,
  doctorSearchableFields,
  doctorUserAdminSelect,
  getDoctorPublicDetailsSelect,
} from "./doctor.constant";
import { Doctor, Prisma } from "../../../generated/prisma/client";
import { Role, UserStatus } from "../../../generated/prisma/enums";
import { IRequestUser } from "../../interface/requestUser.interface";

// PUBLIC: fixed safe columns only. ?include= and ?fields= are ignored on purpose.
const getAllDoctors = async (query: IQueryParams) => {
  const queryBuilder = new QueryBuilder<
    Doctor,
    Prisma.DoctorWhereInput,
    Prisma.DoctorInclude
  >(prisma.doctor, query, {
    searchableFields: doctorPublicSearchableFields,
    filterableFields: doctorPublicFilterableFields,
    sortableFields: doctorPublicSortableFields,
  });
  const result = await queryBuilder
    .search()
    .filter()
    .select(doctorPublicSelect)
    .sort()
    .paginate()
    .where({ isDeleted: false })
    .execute();
  return result;
};

// ADMIN: full doctor data (route is protected with checkAuth(ADMIN, SUPER_ADMIN))
const getAllDoctorsForAdmin = async (query: IQueryParams) => {
  const queryBuilder = new QueryBuilder<
    Doctor,
    Prisma.DoctorWhereInput,
    Prisma.DoctorInclude
  >(prisma.doctor, query, {
    searchableFields: doctorSearchableFields,
    filterableFields: doctorFilterableFields,
  });
  const result = await queryBuilder
    .search()
    .filter()
    .include({
      user: { select: doctorUserAdminSelect },
      specialties: {
        include: {
          specialty: true,
        },
      },
    })
    .dynamicInclude(doctorIncludeConfig)
    .sort()
    .paginate()
    .fields()
    .where({ isDeleted: false })
    .execute();
  return result;
};

// PUBLIC: profile, future free slots and reviews (reviewer name/photo only)
const getDoctorById = async (doctorId: string) => {
  const doctor = await prisma.doctor.findFirst({
    where: {
      id: doctorId,
      isDeleted: false,
    },
    select: getDoctorPublicDetailsSelect(),
  });
  if (!doctor) {
    throw new AppError(StatusCodes.NOT_FOUND, "Doctor not found");
  }
  return {
    ...doctor,
    specialties: doctor.specialties.map((s) => s.specialty),
  };
};

// ADMIN: everything an admin needs to review a doctor
const getDoctorByIdForAdmin = async (doctorId: string) => {
  const doctor = await prisma.doctor.findFirst({
    where: {
      id: doctorId,
    },
    include: {
      user: { select: doctorUserAdminSelect },
      specialties: {
        include: {
          specialty: true,
        },
      },
      doctorSchedules: {
        include: { schedule: true },
        orderBy: { schedule: { startDateTime: "desc" } },
        take: 50,
      },
      reviews: {
        orderBy: { createdAt: "desc" },
        take: 50,
      },
      appointments: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          patient: { select: { id: true, name: true, email: true } },
          schedule: true,
        },
      },
    },
  });
  if (!doctor) {
    throw new AppError(StatusCodes.NOT_FOUND, "Doctor not found");
  }
  return {
    ...doctor,
    specialties: doctor.specialties.map((s) => s.specialty),
  };
};
// fields only an admin may change (they affect billing / verification)
const ADMIN_ONLY_DOCTOR_FIELDS = ["appointmentFee", "registrationNumber"] as const;

const updateDoctor = async (
  doctorId: string,
  payload: IUpdateDoctorPayload,
  user: IRequestUser,
) => {
  const existingDoctor = await prisma.doctor.findFirst({
    where: {
      id: doctorId,
      isDeleted: false,
    },
    select: { id: true, userId: true },
  });
  if (!existingDoctor) {
    throw new AppError(StatusCodes.NOT_FOUND, "Doctor not found");
  }

  const { specialties, doctor: doctorData } = payload;

  // a doctor may edit only their own profile, and not the admin-only fields
  if (user.role === Role.DOCTOR) {
    if (existingDoctor.userId !== user.userId) {
      throw new AppError(StatusCodes.FORBIDDEN, "You can only update your own profile");
    }
    const blocked = ADMIN_ONLY_DOCTOR_FIELDS.filter(
      (field) => doctorData?.[field] !== undefined,
    );
    if (blocked.length > 0) {
      throw new AppError(
        StatusCodes.FORBIDDEN,
        `Only an admin can change: ${blocked.join(", ")}`,
      );
    }
  }

  // specialties is a list of changes: { specialtyId, shouldDelete }
  const toRemove = (specialties ?? [])
    .filter((item) => item.shouldDelete)
    .map((item) => item.specialtyId);
  const toAdd = (specialties ?? [])
    .filter((item) => !item.shouldDelete)
    .map((item) => item.specialtyId);

  if (toAdd.length > 0) {
    const found = await prisma.specialty.count({
      where: { id: { in: toAdd }, isDeleted: false },
    });
    if (found !== new Set(toAdd).size) {
      throw new AppError(StatusCodes.BAD_REQUEST, "One or more specialties do not exist");
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    if (doctorData && Object.keys(doctorData).length > 0) {
      await tx.doctor.update({
        where: { id: doctorId },
        data: doctorData,
      });
    }
    if (toRemove.length > 0) {
      await tx.doctorSpecialty.deleteMany({
        where: { doctorId, specialtyId: { in: toRemove } },
      });
    }
    if (toAdd.length > 0) {
      await tx.doctorSpecialty.createMany({
        data: toAdd.map((specialtyId) => ({ doctorId, specialtyId })),
        skipDuplicates: true,
      });
    }
    return tx.doctor.findUniqueOrThrow({
      where: { id: doctorId },
      include: {
        specialties: {
          include: {
            specialty: true,
          },
        },
      },
    });
  });

  return {
    ...result,
    specialties: result.specialties.map((s) => s.specialty),
  };
};
const deleteDoctor = async (doctorId: string) => {
  const existsDoctor = await prisma.doctor.findUnique({
    where: {
      id: doctorId,
    },
  });
  if (!existsDoctor) {
    throw new AppError(StatusCodes.NOT_FOUND, "Doctor not found");
  }
  if (existsDoctor.isDeleted) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Doctor is already deleted");
  }
  // soft delete the profile AND block the login, then end all sessions
  const deletedAt = new Date();
  const deleteDoctor = await prisma.$transaction(async (tx) => {
    const doctor = await tx.doctor.update({
      where: {
        id: doctorId,
        isDeleted: false,
      },
      data: {
        isDeleted: true,
        deletedAt,
      },
    });
    await tx.user.update({
      where: { id: existsDoctor.userId },
      data: {
        isDeleted: true,
        deletedAt,
        status: UserStatus.DELETED,
      },
    });
    await tx.session.deleteMany({ where: { userId: existsDoctor.userId } });
    return doctor;
  });
  return deleteDoctor;
};

// PUBLIC: free, future slots of one doctor between ?from and ?to (default: next 14 days, max 60)
const getAvailableSlots = async (
  doctorId: string,
  query: { from?: unknown; to?: unknown },
) => {
  const doctor = await prisma.doctor.findFirst({
    where: { id: doctorId, isDeleted: false },
    select: { id: true },
  });
  if (!doctor) {
    throw new AppError(StatusCodes.NOT_FOUND, "Doctor not found");
  }
  const parseDate = (value: unknown) => {
    if (typeof value !== "string" || !value) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new AppError(StatusCodes.BAD_REQUEST, "from/to must be valid dates");
    }
    return date;
  };
  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;
  const requestedFrom = parseDate(query.from);
  const from = requestedFrom && requestedFrom > now ? requestedFrom : now;
  const to = parseDate(query.to) ?? new Date(from.getTime() + 14 * dayMs);
  if (to <= from) {
    throw new AppError(StatusCodes.BAD_REQUEST, "\"to\" must be after \"from\"");
  }
  if (to.getTime() - from.getTime() > 60 * dayMs) {
    throw new AppError(StatusCodes.BAD_REQUEST, "The range can be at most 60 days");
  }
  const slots = await prisma.doctorSchedules.findMany({
    where: {
      doctorId,
      isBooked: false,
      schedule: { startDateTime: { gt: from, lt: to } },
    },
    orderBy: { schedule: { startDateTime: "asc" } },
    select: {
      scheduleId: true,
      schedule: { select: { startDateTime: true, endDateTime: true } },
    },
  });
  return slots.map((slot) => ({
    scheduleId: slot.scheduleId,
    startDateTime: slot.schedule.startDateTime,
    endDateTime: slot.schedule.endDateTime,
  }));
};

export const DoctorService = {
  getAvailableSlots,
  getAllDoctors,
  getAllDoctorsForAdmin,
  getDoctorById,
  getDoctorByIdForAdmin,
  updateDoctor,
  deleteDoctor,
};
