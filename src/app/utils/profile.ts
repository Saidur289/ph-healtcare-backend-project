import { StatusCodes } from "http-status-codes";
import AppError from "../errorHelpers/AppError";
import { IRequestUser } from "../interface/requestUser.interface";
import { prisma } from "../lib/prisma";

// The logged-in user's own profile row. Always look the profile up from the
// session user (never from an id in the URL/body) before using it in a "my ..." query.

export const getPatientProfileOrThrow = async (user: IRequestUser) => {
  const patient = await prisma.patient.findUnique({
    where: { userId: user.userId },
  });
  if (!patient || patient.isDeleted) {
    throw new AppError(StatusCodes.FORBIDDEN, "Patient profile not found for this account");
  }
  return patient;
};

export const getDoctorProfileOrThrow = async (user: IRequestUser) => {
  const doctor = await prisma.doctor.findUnique({
    where: { userId: user.userId },
  });
  if (!doctor || doctor.isDeleted) {
    throw new AppError(StatusCodes.FORBIDDEN, "Doctor profile not found for this account");
  }
  return doctor;
};
