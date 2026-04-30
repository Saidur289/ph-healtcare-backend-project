import { Request, Response } from "express";
import { catchAsync } from "../../shared/catchAsync";
import { PrescriptionService } from "./prescription.service";
import { sendResponse } from "../../shared/sendResponse";
import { StatusCodes } from "http-status-codes";

const givePrescription = catchAsync(async (req: Request, res: Response) => {
  // Implementation for giving prescription
  const payload = req.body;
  const user = req.user; // Assuming user is added to req by authentication middleware
  // Call the service layer to handle the business logic
  const prescription = await PrescriptionService.givePrescription(
    user,
    payload,
  );
  sendResponse(res, {
    httpStatusCode: StatusCodes.CREATED,
    success: true,
    message: "Prescription created successfully",
    data: prescription,
  });
});

const myPrescriptions = catchAsync(async (req: Request, res: Response) => {
  // Implementation for getting my prescriptions
  const user = req.user; // Assuming user is added to req by authentication middleware
  const prescriptions = await PrescriptionService.myPrescriptions(user);
  sendResponse(res, {
    httpStatusCode: StatusCodes.OK,
    success: true,
    message: "Prescriptions retrieved successfully",
    data: prescriptions,
  });
});

const getAllPrescriptions = catchAsync(async (req: Request, res: Response) => {
  // Implementation for getting all prescriptions
  const prescription = await PrescriptionService.getAllPrescriptions();
  sendResponse(res, {
    httpStatusCode: StatusCodes.OK,
    success: true,
    message: "Prescriptions retrieved successfully",
    data: prescription,
  });
});
const updatePrescription = catchAsync(async (req: Request, res: Response) => {
  // Implementation for updating prescription
  const payload = req.body;
  const user = req.user; // Assuming user is added to req by authentication middleware
  const prescriptionId = req.params.id as string;
  const updatedPrescription = await PrescriptionService.updatePrescription(
    user,
    prescriptionId,
    payload,
  );
  sendResponse(res, {
    httpStatusCode: StatusCodes.OK,
    success: true,
    message: "Prescription updated successfully",
    data: updatedPrescription,
  });
});
const deletePrescription = catchAsync(async (req: Request, res: Response) => {
  // Implementation for deleting prescription
  const user = req.user; // Assuming user is added to req by authentication middleware
  const prescriptionId = req.params.id as string;
  await PrescriptionService.deletePrescription(user, prescriptionId);
  sendResponse(res, {
    httpStatusCode: StatusCodes.NO_CONTENT,
    success: true,
    message: "Prescription deleted successfully",
  });
});
export const PrescriptionController = {
  givePrescription,
  myPrescriptions,
  getAllPrescriptions,
  updatePrescription,
  deletePrescription,
};
