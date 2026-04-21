import { Request, Response } from "express";
import { catchAsync } from "../../shared/catchAsync";
import { sendResponse } from "../../shared/sendResponse";
import { ScheduleService } from "./schedule.service";
import { StatusCodes } from "http-status-codes";
import { IQueryParams } from "../../interface/query.interface";

const createSchedule = catchAsync(async (req: Request, res: Response) => {
    const payload = req.body
    const result = await ScheduleService.createSchedule(payload)
    sendResponse(res, {
        httpStatusCode: StatusCodes.CREATED,
        success: true,
        message: "Schedule created successfully",
        data: result
    })
})
const getAllSchedules = catchAsync(async (req: Request, res: Response) => {
    const query = req.query
    const result = await ScheduleService.getAllSchedules(query as IQueryParams)
    sendResponse(res, {
        httpStatusCode: StatusCodes.OK,
        success: true,
        message: "Schedule fetched successfully",
        data: result
    })
})
export const ScheduleController = {
    createSchedule,
    getAllSchedules
}