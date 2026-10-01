import { StatusCodes } from "http-status-codes";
import { Role } from "../../../generated/prisma/enums";
import { deleteFileFromCloudinary } from "../../config/cloudinary.config";
import AppError from "../../errorHelpers/AppError";
import { IRequestUser } from "../../interface/requestUser.interface";
import { prisma } from "../../lib/prisma";
import { TUpdateMyProfilePayload } from "./profile.validation";

const ROLE_FIELDS: Record<"PATIENT" | "DOCTOR" | "ADMIN", (keyof TUpdateMyProfilePayload)[]> = {
  PATIENT: ["name", "contactNumber", "address"],
  DOCTOR: ["name", "contactNumber", "address", "designation", "qualification", "currentWorkingPlace", "experience"],
  ADMIN: ["name", "contactNumber"],
};

const profileKind = (role: Role) =>
  role === Role.PATIENT ? "PATIENT" : role === Role.DOCTOR ? "DOCTOR" : "ADMIN";

const userSelect = { id: true, name: true, email: true, role: true, image: true, emailVerified: true, createdAt: true } as const;

// the logged-in user's account + role profile (patients also get health data and reports)
const getMyProfile = async (user: IRequestUser) => {
  const kind = profileKind(user.role);
  const account = await prisma.user.findUniqueOrThrow({ where: { id: user.userId }, select: userSelect });

  if (kind === "PATIENT") {
    const profile = await prisma.patient.findUnique({
      where: { userId: user.userId },
      select: {
        id: true,
        name: true,
        email: true,
        profilePhoto: true,
        contactNumber: true,
        address: true,
        patientHealthData: true,
        medicalReports: { orderBy: { createdAt: "desc" }, select: { id: true, reportName: true, reportLink: true, createdAt: true } },
      },
    });
    return { ...account, profile };
  }
  if (kind === "DOCTOR") {
    const profile = await prisma.doctor.findUnique({
      where: { userId: user.userId },
      select: {
        id: true,
        name: true,
        email: true,
        profilePhoto: true,
        contactNumber: true,
        address: true,
        registrationNumber: true,
        experience: true,
        gender: true,
        appointmentFee: true,
        qualification: true,
        currentWorkingPlace: true,
        designation: true,
        averageRating: true,
        reviewCount: true,
        isAvailable: true,
        specialties: { select: { specialty: { select: { id: true, title: true } } } },
      },
    });
    return { ...account, profile };
  }
  const profile = await prisma.admin.findUnique({
    where: { userId: user.userId },
    select: { id: true, name: true, email: true, profilePhoto: true, contactNumber: true },
  });
  return { ...account, profile };
};

const updateMyProfile = async (user: IRequestUser, payload: TUpdateMyProfilePayload, photoUrl?: string) => {
  const kind = profileKind(user.role);
  const allowed = ROLE_FIELDS[kind];
  const notAllowed = Object.keys(payload).filter((key) => !allowed.includes(key as keyof TUpdateMyProfilePayload));
  if (notAllowed.length > 0) {
    throw new AppError(StatusCodes.BAD_REQUEST, `You can't change: ${notAllowed.join(", ")}`);
  }
  if (Object.keys(payload).length === 0 && !photoUrl) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Nothing to update");
  }

  const data = { ...payload, ...(photoUrl ? { profilePhoto: photoUrl } : {}) };
  let oldPhoto: string | null = null;

  await prisma.$transaction(async (tx) => {
    const where = { userId: user.userId };
    const current =
      kind === "PATIENT"
        ? await tx.patient.findUnique({ where, select: { profilePhoto: true } })
        : kind === "DOCTOR"
          ? await tx.doctor.findUnique({ where, select: { profilePhoto: true } })
          : await tx.admin.findUnique({ where, select: { profilePhoto: true } });
    if (!current) throw new AppError(StatusCodes.NOT_FOUND, "Profile not found");
    oldPhoto = photoUrl ? current.profilePhoto : null;

    if (kind === "PATIENT") await tx.patient.update({ where, data });
    else if (kind === "DOCTOR") await tx.doctor.update({ where, data });
    else await tx.admin.update({ where, data });

    // keep the account name/photo (used by /auth/me and the navbar) in sync
    if (payload.name || photoUrl) {
      await tx.user.update({
        where: { id: user.userId },
        data: { ...(payload.name ? { name: payload.name } : {}), ...(photoUrl ? { image: photoUrl } : {}) },
      });
    }
  });

  // old photo is removed only after the new one is saved
  if (oldPhoto && oldPhoto !== photoUrl) {
    await deleteFileFromCloudinary(oldPhoto).catch(() => undefined);
  }
  return getMyProfile(user);
};

export const ProfileService = { getMyProfile, updateMyProfile };
