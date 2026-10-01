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
import { UserStatus } from "../../../generated/prisma/enums";

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
const updateDoctor = async (
  doctorId: string,
  payload: IUpdateDoctorPayload,
) => {
  // check if doctor exists
  const isDoctorExists = await prisma.doctor.findFirst({
    where: {
      id: doctorId,
      isDeleted: false,
    },
    select: {
      specialties: {
        select: {
          specialtyId: true,
        },
      },
    },
  });

  if (!isDoctorExists) {
    throw new AppError(StatusCodes.NOT_FOUND, "Doctor not found");
  }

  const { specialties, doctor: doctorData } = payload;

  // update doctor basic info
  const updatedDoctor = await prisma.doctor.update({
    where: {
      id: doctorId,
    },
    data: doctorData || {},
    include: {
      specialties: {
        include: {
          specialty: true,
        },
      },
    },
  });

  // update specialties
  if (specialties && specialties.length > 0) {
    // delete old specialties
    await prisma.doctorSpecialty.deleteMany({
      where: {
        doctorId,
      },
    });

    // prepare new specialties data
    const doctorSpecialtyData = specialties.map((item) => ({
      doctorId,
      specialtyId: item.specialtyId,
    }));

    // create new specialties
    await prisma.doctorSpecialty.createMany({
      data: doctorSpecialtyData,
    });

    // get updated doctor with specialties
    const result = await prisma.doctor.findUnique({
      where: {
        id: doctorId,
      },
      include: {
        specialties: {
          include: {
            specialty: true,
          },
        },
      },
    });

    return {
      ...result,
      specialties: result?.specialties.map((s) => s.specialty),
    };
  }

  return {
    ...updatedDoctor,
    specialties: updatedDoctor.specialties.map((s) => s.specialty),
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

export const DoctorService = {
  getAllDoctors,
  getAllDoctorsForAdmin,
  getDoctorById,
  getDoctorByIdForAdmin,
  updateDoctor,
  deleteDoctor,
};
