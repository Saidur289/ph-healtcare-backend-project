import { Request, Response } from "express";
import { catchAsync } from "../../shared/catchAsync";
import { sendResponse } from "../../shared/sendResponse";
import { PatientService } from "./patient.service";

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

export const PatientController = {
  updateProfile,
};
