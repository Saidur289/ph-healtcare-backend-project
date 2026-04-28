import { deleteFileFromCloudinary } from "../../config/cloudinary.config";
import { IRequestUser } from "../../interface/requestUser.interface";
import { prisma } from "../../lib/prisma";
import {
  IUpdatePatientHealthDataPayload,
  IUpdatePatientProfilePayload,
} from "./patient.interface";
import { convertDate } from "./patient.utils";

const updateProfile = async (
  user: IRequestUser,
  payload: IUpdatePatientProfilePayload,
) => {
  const patientData = await prisma.patient.findUniqueOrThrow({
    where: { email: user.email },
  });
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
      await tx.patientHealthData.upsert({
        where: { patientId: patientData.id },
        update: healthDataToSave,
        create: {
          patientId: patientData.id,
          ...healthDataToSave,
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
          const deleteReport = await tx.medicalReport.delete({
            where: {
              id: report.reportId,
            },
          });
          if (deleteReport.reportLink) {
            await deleteFileFromCloudinary(deleteReport.reportLink);
          }
        } else if (report.reportName && report.reportLink) {
          await tx.medicalReport.create({
            data: {
              patientId: patientData.id,
              reportName: report.reportName,
              reportLink: report.reportLink,
            },
          });
        }
      }
    }
  });
  const result = await prisma.patient.findUniqueOrThrow({
    where: { email: user.email },
    include: {
      patientHealthData: true,
      patientMedicalReport: true,
    },
  });
  return result;
};
export const PatientService = {
  updateProfile,
};
