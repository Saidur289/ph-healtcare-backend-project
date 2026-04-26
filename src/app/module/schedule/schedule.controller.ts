import { Request, Response } from "express";
import { catchAsync } from "../../shared/catchAsync";
import { sendResponse } from "../../shared/sendResponse";
import { ScheduleService } from "./schedule.service";
import { StatusCodes } from "http-status-codes";
import { IQueryParams } from "../../interface/query.interface";

const createSchedule = catchAsync(async (req: Request, res: Response) => {
  const payload = req.body;
  const result = await ScheduleService.createSchedule(payload);
  sendResponse(res, {
    httpStatusCode: StatusCodes.CREATED,
    success: true,
    message: "Schedule created successfully",
    data: result,
  });
});
const getAllSchedules = catchAsync(async (req: Request, res: Response) => {
  const query = req.query;
  const result = await ScheduleService.getAllSchedules(query as IQueryParams);
  sendResponse(res, {
    httpStatusCode: StatusCodes.OK,
    success: true,
    message: "Schedule fetched successfully",
    data: result,
  });
});
const getScheduleById = catchAsync(async (req: Request, res: Response) => {
  const scheduleId = req.params.id;
  const result = await ScheduleService.getScheduleById(scheduleId as string);
  sendResponse(res, {
    httpStatusCode: StatusCodes.OK,
    success: true,
    message: "Schedule fetched successfully",
    data: result,
  });
});
const updateSchedule = catchAsync(async (req: Request, res: Response) => {
  const scheduleId = req.params.id;
  const payload = req.body;
  const result = await ScheduleService.updateSchedule(
    scheduleId as string,
    payload,
  );
  sendResponse(res, {
    httpStatusCode: StatusCodes.OK,
    success: true,
    message: "Schedule updated successfully",
    data: result,
  });
});
const deleteSchedule = catchAsync(async (req: Request, res: Response) => {
  const scheduleId = req.params.id;
  const result = await ScheduleService.deleteSchedule(scheduleId as string);
  sendResponse(res, {
    httpStatusCode: StatusCodes.OK,
    success: true,
    message: "Schedule deleted successfully",
    data: result,
  });
});
export const ScheduleController = {
  createSchedule,
  getAllSchedules,
  getScheduleById,
  updateSchedule,
  deleteSchedule,
};
