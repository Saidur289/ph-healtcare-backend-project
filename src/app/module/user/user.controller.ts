import { Request, Response } from "express";
import { catchAsync } from "../../shared/catchAsync";
import { UserService } from "./user.service";
import { sendResponse } from "../../shared/sendResponse";
import { StatusCodes } from "http-status-codes";

const createDoctor = catchAsync(async (req: Request, res: Response) => {
    const payload = req.body
    // console.log(payload);
    const result = await UserService.createDoctor(payload)
    sendResponse(res, {
        httpStatusCode: StatusCodes.CREATED,
        success: true,
        message: "Doctor created successfully",
        data: result
    })
})

const createAdmin = catchAsync(async (req: Request, res: Response) => {
    const payload = req.body
    const result = await UserService.createAdmin(payload)
    sendResponse(res, {
        httpStatusCode: StatusCodes.CREATED,
        success: true,
        message: "Admin created successfully",
        data: result
    })
})
// const createSuperAdmin = catchAsync(async (req: Request, res: Response) => {
//     const payload = req.body
//     const result = await UserService.createSuperAdmin(payload)
//     sendResponse(res, {
//         httpStatusCode: StatusCodes.CREATED,
//         success: true,
//         message: "Super admin created successfully",
//         data: result
//     })
// })



export const UserController = {
    createDoctor,
    createAdmin,

}