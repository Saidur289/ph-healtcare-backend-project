import { Request, Response } from "express";
import { catchAsync } from "../../shared/catchAsync";
import { sendResponse } from "../../shared/sendResponse";
import { PatientService } from "./patient.service";
import { IQueryParams } from "../../interface/query.interface";

const updateProfile = catchAsync(async (req: Request, res: Response) => {
  const payload = req.body;
  const result = await PatientService.updateProfile(req.user, payload);
  sendResponse(res, {
    httpStatusCode: 200,
    success: true,
    message: "Profile updated successfully",
    data: result,
  });
});

const getAllPatients = catchAsync(async (req: Request, res: Response) => {
  const result = await PatientService.getAllPatients(req.query as IQueryParams);
  sendResponse(res, { httpStatusCode: 200, success: true, message: "Patients fetched", data: result.data, meta: result.meta });
});
export const PatientController = {
  getAllPatients,
  updateProfile,
};
