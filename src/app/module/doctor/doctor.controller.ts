import { Request, Response } from "express";
import { catchAsync } from "../../shared/catchAsync";
import { DoctorService } from "./doctor.service";
import { sendResponse } from "../../shared/sendResponse";
import { IQueryParams } from "../../interface/query.interface";

const getAllDoctors = catchAsync(async (req: Request, res: Response) => {
  const query = req.query;

  const result = await DoctorService.getAllDoctors(query as IQueryParams);
  sendResponse(res, {
    success: true,
    httpStatusCode: 200,
    message: "Doctors retrieved successfully",
    data: result.data,
    meta: result.meta,
  });
});
const getDoctorById = catchAsync(async (req: Request, res: Response) => {
  const doctorId = req.params.id;
  const result = await DoctorService.getDoctorById(doctorId as string);
  sendResponse(res, {
    success: true,
    httpStatusCode: 200,
    message: "Doctor retrieved successfully",
    data: result,
  });
});
const getAllDoctorsForAdmin = catchAsync(async (req: Request, res: Response) => {
  const result = await DoctorService.getAllDoctorsForAdmin(
    req.query as IQueryParams,
  );
  sendResponse(res, {
    success: true,
    httpStatusCode: 200,
    message: "Doctors retrieved successfully",
    data: result.data,
    meta: result.meta,
  });
});
const getDoctorByIdForAdmin = catchAsync(
  async (req: Request, res: Response) => {
    const result = await DoctorService.getDoctorByIdForAdmin(
      req.params.id as string,
    );
    sendResponse(res, {
      success: true,
      httpStatusCode: 200,
      message: "Doctor retrieved successfully",
      data: result,
    });
  },
);
const updateDoctor = catchAsync(async (req: Request, res: Response) => {
  const doctorId = req.params.id;
  const payload = req.body;

  const result = await DoctorService.updateDoctor(
    doctorId as string,
    payload,
    req.user,
  );

  sendResponse(res, {
    success: true,
    httpStatusCode: 200,
    message: "Doctor updated successfully",
    data: result,
  });
});
const deleteDoctor = catchAsync(async (req: Request, res: Response) => {
  const doctorId = req.params.id;
  const result = await DoctorService.deleteDoctor(doctorId as string);
  sendResponse(res, {
    success: true,
    httpStatusCode: 200,
    message: "Doctor deleted successfully",
    data: result,
  });
});

const getAvailableSlots = catchAsync(async (req: Request, res: Response) => {
  const result = await DoctorService.getAvailableSlots(
    req.params.id as string,
    req.query,
  );
  sendResponse(res, {
    success: true,
    httpStatusCode: 200,
    message: "Available slots retrieved successfully",
    data: result,
  });
});

export const DoctorController = {
  getAvailableSlots,
  getAllDoctors,
  getAllDoctorsForAdmin,
  getDoctorById,
  getDoctorByIdForAdmin,
  updateDoctor,
  deleteDoctor,
};
