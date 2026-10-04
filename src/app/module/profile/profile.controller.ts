import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import AppError from "../../errorHelpers/AppError";
import { catchAsync } from "../../shared/catchAsync";
import { sendResponse } from "../../shared/sendResponse";
import { ProfileService } from "./profile.service";

const getMyProfile = catchAsync(async (req: Request, res: Response) => {
  const result = await ProfileService.getMyProfile(req.user);
  sendResponse(res, { success: true, httpStatusCode: 200, message: "Profile fetched", data: result });
});

const updateMyProfile = catchAsync(async (req: Request, res: Response) => {
  // a photo must be an image (the shared upload filter also allows PDF)
  if (req.file && !req.file.mimetype.startsWith("image/")) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Profile photo must be a JPG, PNG or WEBP image");
  }
  const result = await ProfileService.updateMyProfile(req.user, req.body, req.file?.path);
  sendResponse(res, { success: true, httpStatusCode: 200, message: "Profile updated", data: result });
});

const exportMyData = catchAsync(async (req: Request, res: Response) => {
  const result = await ProfileService.exportMyData(req.user);
  res.setHeader("Cache-Control", "no-store");
  sendResponse(res, { success: true, httpStatusCode: 200, message: "Your data", data: result });
});

const deleteMyAccount = catchAsync(async (req: Request, res: Response) => {
  await ProfileService.deleteMyAccount(req.user, req.body);
  sendResponse(res, { success: true, httpStatusCode: 200, message: "Your account has been deleted" });
});

export const ProfileController = { getMyProfile, updateMyProfile, exportMyData, deleteMyAccount };
