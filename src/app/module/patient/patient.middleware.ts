import { NextFunction, Request, Response } from "express";
import {
  IUpdatePatientInfoPayload,
  IUpdatePatientProfilePayload,
} from "./patient.interface";

/**
 * Middleware for updating patient profile
 *
 * Purpose:
 * - Parse incoming multipart/form-data JSON string
 * - Handle uploaded profile photo
 * - Handle uploaded medical report files
 * - Merge everything into req.body
 */
export const updatePatientProfileMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  /**
   * If frontend sends form-data like:
   * data: '{"patientInfo":{"name":"John"}}'
   *
   * Then convert string JSON into object
   */
  if (req.body.data) {
    req.body = JSON.parse(req.body.data);
  }

  /**
   * Store request body into typed payload
   */
  const payload: IUpdatePatientProfilePayload = req.body;

  // Log incoming payload before file processing

  /**
   * Uploaded files from multer
   *
   * Example:
   * req.files = {
   *   profilePhoto: [file],
   *   medicalReports: [file1, file2]
   * }
   */
  const files = req.files as {
    [fieldName: string]: Express.Multer.File[] | undefined;
  };

  /**
   * ===============================
   * Handle Profile Photo Upload
   * ===============================
   */
  if (files?.profilePhoto?.[0]) {

    // If patientInfo not exists, create empty object
    if (!payload.patientInfo) {
      payload.patientInfo = {} as IUpdatePatientInfoPayload;
    }

    // Save uploaded file path
    payload.patientInfo.profilePhoto = files.profilePhoto[0].path;

  }

  /**
   * =====================================
   * Handle Medical Report File Uploads
   * =====================================
   */
  if (files?.medicalReports && files.medicalReports.length > 0) {

    /**
     * Convert uploaded files into report objects
     */
    const newReports = files.medicalReports.map((file) => ({
      reportName:
        file.originalname || `Medical Report - ${new Date().getTime()}`,
      reportLink: file.path,
    }));


    /**
     * If reports already exist in payload,
     * merge old + new reports
     */
    if (
      payload.patientMedicalReport &&
      Array.isArray(payload.patientMedicalReport)
    ) {
      payload.patientMedicalReport = [
        ...payload.patientMedicalReport,
        ...newReports,
      ];

    } else {
      /**
       * If no reports exist,
       * create new array
       */
      payload.patientMedicalReport = newReports;

    }
  }

  /**
   * Final payload after processing
   */

  /**
   * Replace req.body with updated payload
   */
  req.body = payload;

  /**
   * Move to next middleware/controller
   */
  next();
};
