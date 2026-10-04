import { StatusCodes } from "http-status-codes";
import { decryptHealthData, decryptReport } from "../../utils/healthCrypto";
import { decryptJson, decryptText } from "../../utils/fieldEncryption";
import { audit } from "../../utils/audit";
import { auth } from "../../lib/auth";
import { AppointmentStatus, Role, UserStatus } from "../../../generated/prisma/enums";
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
  const [base, credentials] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: user.userId }, select: userSelect }),
    prisma.account.count({ where: { userId: user.userId, providerId: "credential" } }),
  ]);
  // Google-only accounts have no password (account deletion asks for "DELETE" instead)
  const account = { ...base, hasPassword: credentials > 0 };

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
    // stored encrypted (utils/healthCrypto.ts)
    return {
      ...account,
      profile: profile && {
        ...profile,
        patientHealthData: decryptHealthData(profile.patientHealthData),
        medicalReports: profile.medicalReports.map(decryptReport),
      },
    };
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


// ------------------------------------------------------------------ privacy (export / delete)

// Everything we hold about the patient, readable (encrypted fields decrypted). Files are listed
// by name and date only; each can be downloaded through /files.
const exportMyData = async (user: IRequestUser) => {
  if (user.role !== Role.PATIENT) {
    throw new AppError(StatusCodes.FORBIDDEN, "Data export is available for patient accounts");
  }
  const account = await prisma.user.findUniqueOrThrow({ where: { id: user.userId }, select: userSelect });
  const patient = await prisma.patient.findUniqueOrThrow({
    where: { userId: user.userId },
    include: {
      patientHealthData: true,
      medicalReports: { select: { id: true, reportName: true, createdAt: true } },
      appointments: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          paymentStatus: true,
          createdAt: true,
          schedule: { select: { startDateTime: true, endDateTime: true } },
          doctor: { select: { name: true, designation: true } },
          payment: { select: { amount: true, status: true, invoiceNumber: true, paidAt: true, refundedAt: true } },
        },
      },
      prescriptions: {
        orderBy: { createdAt: "desc" },
        select: { id: true, createdAt: true, followUpDate: true, instructions: true, medicines: true, doctor: { select: { name: true } } },
      },
      reviews: { select: { id: true, rating: true, comment: true, createdAt: true, doctor: { select: { name: true } } } },
    },
  });
  await audit({ action: "user.data_export", entityType: "User", entityId: user.userId });
  return {
    exportedAt: new Date().toISOString(),
    account,
    profile: {
      name: patient.name,
      email: patient.email,
      contactNumber: patient.contactNumber,
      address: patient.address,
      createdAt: patient.createdAt,
    },
    healthData: decryptHealthData(patient.patientHealthData),
    medicalReports: patient.medicalReports.map(decryptReport),
    appointments: patient.appointments,
    prescriptions: patient.prescriptions.map((p) => ({
      ...p,
      instructions: decryptText(p.instructions),
      medicines: decryptJson(p.medicines),
    })),
    reviews: patient.reviews,
  };
};

// Patient account deletion: personal and health data are removed / anonymized, while
// appointments, prescriptions and payments stay (medical and financial records must be
// kept, see docs/data-retention.md) but no longer point to a person.
const deleteMyAccount = async (user: IRequestUser, input: { password?: string; confirm?: string }) => {
  if (user.role !== Role.PATIENT) {
    throw new AppError(StatusCodes.FORBIDDEN, "Only patient accounts can be deleted here. Doctors and admins: contact an administrator.");
  }
  const credential = await prisma.account.findFirst({ where: { userId: user.userId, providerId: "credential" }, select: { password: true } });
  if (credential?.password) {
    const ctx = await auth.$context;
    const valid = input.password ? await ctx.password.verify({ hash: credential.password, password: input.password }) : false;
    if (!valid) throw new AppError(StatusCodes.UNAUTHORIZED, "The password is not correct");
  } else if (input.confirm !== "DELETE") {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Type DELETE to confirm');
  }

  const patient = await prisma.patient.findUniqueOrThrow({
    where: { userId: user.userId },
    select: { id: true, profilePhoto: true, medicalReports: { select: { reportLink: true } } },
  });
  const upcoming = await prisma.appointment.count({
    where: {
      patientId: patient.id,
      status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.INPROGRESS] },
      schedule: { endDateTime: { gte: new Date() } },
    },
  });
  if (upcoming > 0) {
    throw new AppError(StatusCodes.CONFLICT, "Cancel your upcoming appointments first, then delete the account.");
  }

  const placeholderEmail = `deleted-${user.userId}@deleted.invalid`;
  const deletedAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.patientHealthData.deleteMany({ where: { patientId: patient.id } });
    await tx.medicalReport.deleteMany({ where: { patientId: patient.id } });
    // ratings stay in the doctor's average; the written text (personal) is removed
    await tx.review.updateMany({ where: { patientId: patient.id }, data: { comment: null } });
    await tx.patient.update({
      where: { id: patient.id },
      data: { name: "Deleted patient", email: placeholderEmail, contactNumber: null, address: null, profilePhoto: null, isDeleted: true, deletedAt },
    });
    await tx.session.deleteMany({ where: { userId: user.userId } });
    await tx.account.deleteMany({ where: { userId: user.userId } });
    await tx.user.update({
      where: { id: user.userId },
      data: { name: "Deleted patient", email: placeholderEmail, image: null, status: UserStatus.DELETED, isDeleted: true, deletedAt },
    });
  });
  // files go after the commit (a failed delete must not undo the anonymization)
  const files = [patient.profilePhoto, ...patient.medicalReports.map((r) => r.reportLink)].filter((f): f is string => Boolean(f));
  await Promise.allSettled(files.map((file) => deleteFileFromCloudinary(file)));
  await audit({ action: "user.account_deleted", entityType: "User", entityId: user.userId });
};

export const ProfileService = { getMyProfile, updateMyProfile, exportMyData, deleteMyAccount };
