
import { Request, Response } from "express"
import { catchAsync } from "../../shared/catchAsync"
import { DoctorScheduleService } from "./doctorSchedule.service"
import { sendResponse } from "../../shared/sendResponse"
import { StatusCodes } from "http-status-codes"
import { IQueryParams } from "../../interface/query.interface"

const createDoctorSchedule = catchAsync(async (req: Request, res: Response) => {
    const user = req.user
    const payload = req.body
    const result = await DoctorScheduleService.createDoctorSchedule(user, payload)
    sendResponse(res, {
        httpStatusCode: StatusCodes.OK,
        success: true,
        message: "Schedule created successfully",
        data: result
    })
})
const getMyDoctorSchedules = catchAsync(async (req: Request, res: Response) => {
    const user = req.user
    const query = req.query
    const result = await DoctorScheduleService.getMyDoctorSchedules(user, query as IQueryParams)
    sendResponse(res, {
        httpStatusCode: StatusCodes.OK,
        success: true,
        message: "Schedule fetched successfully",
        data: result
    })
})
const getAllDoctorSchedules = catchAsync(async (req: Request, res: Response) => {
    const query = req.query
    const result = await DoctorScheduleService.getAllDoctorSchedules(query as IQueryParams)
    sendResponse(res, {
        httpStatusCode: StatusCodes.OK,
        success: true,
        message: "Schedule fetched successfully",
        data: result
    })
})
const getDoctorScheduleById = catchAsync(async (req: Request, res: Response) => {
    const scheduleId = req.params.scheduleId;
    const doctorId = req.params.doctorId
    const result = await DoctorScheduleService.getDoctorScheduleById(doctorId as string, scheduleId as string)
    sendResponse(res, {
        httpStatusCode: StatusCodes.OK,
        success: true,
        message: "Schedule fetched successfully",
        data: result
    })
})
const updateDoctorSchedule = catchAsync(async (req: Request, res: Response) => {
    const user = req.user
    const payload = req.body
    const result = await DoctorScheduleService.updateDoctorSchedule(user, payload)
    sendResponse(res, {
        httpStatusCode: StatusCodes.OK,
        success: true,
        message: "Schedule updated successfully",
        data: result
    })
})
const deleteMyDoctorSchedule = catchAsync(async (req: Request, res: Response) => {
    const user = req.user
    const scheduleId = req.params.id
    const result = await DoctorScheduleService.deleteMyDoctorSchedule(scheduleId as string, user)
    sendResponse(res, {
        httpStatusCode: StatusCodes.OK,
        success: true,
        message: "Schedule deleted successfully",
        data: result
    })
})
export const DoctorScheduleController = {
    createDoctorSchedule,
    getMyDoctorSchedules,
    getAllDoctorSchedules,
    getDoctorScheduleById,
    updateDoctorSchedule,
    deleteMyDoctorSchedule
}