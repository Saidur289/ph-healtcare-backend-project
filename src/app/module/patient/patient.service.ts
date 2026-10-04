import { StatusCodes } from "http-status-codes";
import { decryptHealthData, decryptReport, encryptHealthData, encryptReportName } from "../../utils/healthCrypto";
import { deleteFileFromCloudinary } from "../../config/cloudinary.config";
import AppError from "../../errorHelpers/AppError";
import { IRequestUser } from "../../interface/requestUser.interface";
import { prisma } from "../../lib/prisma";
import {
  IUpdatePatientHealthDataPayload,
  IUpdatePatientProfilePayload,
} from "./patient.interface";
import { convertDate } from "./patient.utils";
import { QueryBuilder } from "../../utils/QueryBuilder";
import { IQueryParams } from "../../interface/query.interface";
import { Patient, Prisma } from "../../../generated/prisma/client";

const updateProfile = async (
  user: IRequestUser,
  payload: IUpdatePatientProfilePayload,
) => {
  const patientData = await prisma.patient.findUniqueOrThrow({
    where: { email: user.email },
  });
  // files are removed from Cloudinary only after the DB transaction succeeded
  const filesToDelete: string[] = [];
  await prisma.$transaction(async (tx) => {
    if (payload.patientInfo) {
      await tx.patient.update({
        where: { id: patientData.id },
        data: {
          ...payload.patientInfo,
        },
      });
      if (payload.patientInfo.name || payload.patientInfo.profilePhoto) {
        const userData = {
          name: payload.patientInfo.name
            ? payload.patientInfo.name
            : patientData.name,
          image: payload.patientInfo.profilePhoto
            ? payload.patientInfo.profilePhoto
            : patientData.profilePhoto,
        };
        await tx.user.update({
          where: { id: patientData.userId },
          data: {
            ...userData,
          },
        });
      }
    }
    if (payload.patientHealthData) {
      // the first save must include the required columns; later saves can be partial
      const existingHealthData = await tx.patientHealthData.findUnique({
        where: { patientId: patientData.id },
        select: { id: true },
      });
      const missing = (["gender", "dateOfBirth", "bloodGroup", "height", "weight"] as const).filter(
        (field) => payload.patientHealthData?.[field] === undefined,
      );
      if (!existingHealthData && missing.length > 0) {
        throw new AppError(StatusCodes.BAD_REQUEST, `Please fill in: ${missing.join(", ")}`);
      }
      const healthDataToSave: IUpdatePatientHealthDataPayload = {
        ...payload.patientHealthData,
      };
      if (payload.patientHealthData.dateOfBirth) {
        healthDataToSave.dateOfBirth = convertDate(
          typeof healthDataToSave.dateOfBirth === "string"
            ? healthDataToSave.dateOfBirth
            : undefined,
        ) as Date;
      }
      // free-text notes are encrypted at rest (utils/healthCrypto.ts)
      const encrypted = encryptHealthData(healthDataToSave);
      await tx.patientHealthData.upsert({
        where: { patientId: patientData.id },
        update: encrypted,
        create: {
          patientId: patientData.id,
          ...encrypted,
        },
      });
    }
    if (
      payload.patientMedicalReport &&
      Array.isArray(payload.patientMedicalReport) &&
      payload.patientMedicalReport.length > 0
    ) {
      for (const report of payload.patientMedicalReport) {
        if (report.shouldDelete && report.reportId) {
          // only this patient's own reports can be deleted
          const ownReport = await tx.medicalReport.findFirst({
            where: { id: report.reportId, patientId: patientData.id },
          });
          if (!ownReport) {
            throw new AppError(StatusCodes.NOT_FOUND, "Medical report not found");
          }
          await tx.medicalReport.delete({ where: { id: ownReport.id } });
          if (ownReport.reportLink) {
            filesToDelete.push(ownReport.reportLink);
          }
        } else if (report.reportName && report.reportLink) {
          await tx.medicalReport.create({
            data: {
              patientId: patientData.id,
              reportName: encryptReportName(report.reportName),
              reportLink: report.reportLink,
            },
          });
        }
      }
    }
  });
  await Promise.allSettled(filesToDelete.map((file) => deleteFileFromCloudinary(file)));
  const result = await prisma.patient.findUniqueOrThrow({
    where: { email: user.email },
    include: { patientHealthData: true, medicalReports: true },
  });
  return {
    ...result,
    patientHealthData: decryptHealthData(result.patientHealthData),
    medicalReports: result.medicalReports.map(decryptReport),
  };
};
// ADMIN: patients with account status. Health data and reports are NOT included
// (medical data is only for the patient and their doctors).
const getAllPatients = async (query: IQueryParams) => {
  const queryBuilder = new QueryBuilder<Patient, Prisma.PatientWhereInput, Prisma.PatientInclude>(prisma.patient, query, {
    searchableFields: ["name", "email", "contactNumber"],
    filterableFields: ["user.status", "isDeleted", "createdAt"],
  });
  return queryBuilder
    .search()
    .filter()
    .include({
      user: { select: { id: true, status: true, emailVerified: true, createdAt: true } },
      _count: { select: { appointments: true, reviews: true } },
    })
    .sort()
    .paginate()
    .fields()
    .where({ isDeleted: false })
    .execute();
};
export const PatientService = {
  getAllPatients,
  updateProfile,
};
