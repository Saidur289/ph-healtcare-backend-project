import { Request, Response } from "express";
import { catchAsync } from "../../shared/catchAsync";
import { UserService } from "./user.service";
import { sendResponse } from "../../shared/sendResponse";
import { StatusCodes } from "http-status-codes";

const createDoctor = catchAsync(async (req: Request, res: Response) => {
    const payload = req.body
    const result = await UserService.createDoctor(payload)
    sendResponse(res, {
        httpStatusCode: StatusCodes.CREATED,
        success: true,
        message: "Doctor created successfully",
        data: result
    })
})
export const UserController = {
    createDoctor
}