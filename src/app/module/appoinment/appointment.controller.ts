import { Request, Response } from "express";
import { sendResponse } from "../../shared/sendResponse";
import { AppointmentService } from "./appointment.service";
import { StatusCodes } from "http-status-codes";
import { catchAsync } from "../../shared/catchAsync";

const bookAppointment = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  const payload = req.body;
  const result = await AppointmentService.bookAppointment(user, payload);
  sendResponse(res, {
    httpStatusCode: StatusCodes.OK,
    success: true,
    message: "Appointment created successfully",
    data: result,
  });
});
const getMyAppointment = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  const result = await AppointmentService.getMyAppointments(user);
  sendResponse(res, {
    httpStatusCode: StatusCodes.OK,
    success: true,
    message: "Appointments fetched successfully",
    data: result,
  });
});
const getMySingleAppointment = catchAsync(
  async (req: Request, res: Response) => {
    const user = req.user;
    const appointmentId = req.params.id;
    const result = await AppointmentService.getMySingleAppointment(
      user,
      appointmentId as string,
    );
    sendResponse(res, {
      httpStatusCode: StatusCodes.OK,
      success: true,
      message: "Appointments fetched successfully",
      data: result,
    });
  },
);
const changeAppointmentStatus = catchAsync(
  async (req: Request, res: Response) => {
    const user = req.user;
    const appointmentId = req.params.id;
    const payload = req.body;
    const result = await AppointmentService.changeAppointmentStatus(
      appointmentId as string,
      payload,
      user,
    );
    sendResponse(res, {
      httpStatusCode: StatusCodes.OK,
      success: true,
      message: "Appointments fetched successfully",
      data: result,
    });
  },
);
const bookAppointmentWithPayLater = catchAsync(
  async (req: Request, res: Response) => {
    const user = req.user;
    const payload = req.body;
    const result = await AppointmentService.bookAppointmentWithPayLater(
      payload,
      user,
    );
    sendResponse(res, {
      httpStatusCode: StatusCodes.OK,
      success: true,
      message: "Appointment created with payment with later",
      data: result,
    });
  },
);
const initiatePayment = catchAsync(async (req: Request, res: Response) => {
  const appointmentId = req.params.id;
  const user = req.user;
  const result = await AppointmentService.initiatePayment(
    appointmentId as string,
    user,
  );
  sendResponse(res, {
    httpStatusCode: StatusCodes.OK,
    success: true,
    message: "Payment initiated successfully",
    data: result,
  });
});

export const AppointmentController = {
  bookAppointment,
  getMyAppointment,
  getMySingleAppointment,
  changeAppointmentStatus,
  bookAppointmentWithPayLater,
  initiatePayment,
};
