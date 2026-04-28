import { NextFunction, Request, Response } from "express";
import {
  IUpdatePatientInfoPayload,
  IUpdatePatientProfilePayload,
} from "./patient.interface";

export const updatePatientProfileMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (req.body.data) {
    req.body = JSON.parse(req.body.data);
  }
  const payload: IUpdatePatientProfilePayload = req.body;
  const files = req.files as {
    [fieldName: string]: Express.Multer.File[] | undefined;
  };
  if (files?.profilePhoto?.[0]) {
    if (!payload.patientInfo) {
      payload.patientInfo = {} as IUpdatePatientInfoPayload;
    }
    payload.patientInfo.profilePhoto = files.profilePhoto[0].path;
  }
  if (files?.medicalReports && files?.medicalReports.length > 0) {
    const newReports = files.medicalReports.map((file) => ({
      reportName:
        file.originalname || `Medical Report - ${new Date().getTime()}`,
      reportLink: file.path,
    }));
    if (
      payload.patientMedicalReport &&
      Array.isArray(payload.patientMedicalReport)
    ) {
      payload.patientMedicalReport = [
        ...payload.patientMedicalReport,
        ...newReports,
      ];
    } else {
      payload.patientMedicalReport = newReports;
    }
  }
  console.log(payload);
  req.body = payload;
  next();
};
