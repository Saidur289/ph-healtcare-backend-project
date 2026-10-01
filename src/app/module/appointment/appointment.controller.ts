import { Request, Response } from "express";
import { sendResponse } from "../../shared/sendResponse";
import { AppointmentService } from "./appointment.service";
import { StatusCodes } from "http-status-codes";
import { catchAsync } from "../../shared/catchAsync";
import AppError from "../../errorHelpers/AppError";

// Optional "Idempotency-Key" header: the same key returns the same booking (double click / retry)
const getIdempotencyKey = (req: Request) => {
  const key = req.get("Idempotency-Key");
  if (key === undefined) return undefined;
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(key)) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Idempotency-Key must be 8-100 letters, numbers, '-' or '_'",
    );
  }
  return key;
};

const bookAppointment = catchAsync(async (req: Request, res: Response) => {
  const result = await AppointmentService.bookAppointment(
    req.user,
    req.body,
    getIdempotencyKey(req),
  );
  sendResponse(res, {
    httpStatusCode: StatusCodes.CREATED,
    success: true,
    message: "Appointment booked. Please complete the payment.",
    data: result,
  });
});
const getMyAppointment = catchAsync(async (req: Request, res: Response) => {
  const result = await AppointmentService.getMyAppointments(req.user);
  sendResponse(res, {
    httpStatusCode: StatusCodes.OK,
    success: true,
    message: "Appointments fetched successfully",
    data: result,
  });
});
const getMySingleAppointment = catchAsync(
  async (req: Request, res: Response) => {
    const result = await AppointmentService.getMySingleAppointment(
      req.user,
      req.params.id as string,
    );
    sendResponse(res, {
      httpStatusCode: StatusCodes.OK,
      success: true,
      message: "Appointment fetched successfully",
      data: result,
    });
  },
);
const changeAppointmentStatus = catchAsync(
  async (req: Request, res: Response) => {
    const { status, reason } = req.body;
    const result = await AppointmentService.changeAppointmentStatus(
      req.params.id as string,
      status,
      req.user,
      reason,
    );
    sendResponse(res, {
      httpStatusCode: StatusCodes.OK,
      success: true,
      message: "Appointment status updated successfully",
      data: result,
    });
  },
);
const rescheduleAppointment = catchAsync(
  async (req: Request, res: Response) => {
    const result = await AppointmentService.rescheduleAppointment(
      req.user,
      req.params.id as string,
      req.body.scheduleId,
    );
    sendResponse(res, {
      httpStatusCode: StatusCodes.OK,
      success: true,
      message: "Appointment rescheduled successfully",
      data: result,
    });
  },
);
const bookAppointmentWithPayLater = catchAsync(
  async (req: Request, res: Response) => {
    const result = await AppointmentService.bookAppointmentWithPayLater(
      req.body,
      req.user,
      getIdempotencyKey(req),
    );
    sendResponse(res, {
      httpStatusCode: StatusCodes.CREATED,
      success: true,
      message: "Appointment booked. Please pay before the payment deadline.",
      data: result,
    });
  },
);
const initiatePayment = catchAsync(async (req: Request, res: Response) => {
  const result = await AppointmentService.initiatePayment(
    req.params.id as string,
    req.user,
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
  rescheduleAppointment,
  bookAppointmentWithPayLater,
  initiatePayment,
};
