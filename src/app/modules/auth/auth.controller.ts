import { Request, Response } from "express";
import { catchAsync } from "../../shared/catchAsync";
import { AuthService } from "./auth.service";
import { sendResponse } from "../../shared/sendResponse";

const registerPatient = catchAsync(async (req: Request, res: Response) => {
    const payload = req.body;
    const result = await AuthService.registerPatient(payload)
    sendResponse(res, {
        success: true,
        httpStatusCode: 201,
        message: "Patient registered successfully",
        data: result
    })
})

const loginUser = catchAsync(async (req: Request, res: Response) => {
    const payload = req.body
    const result = await AuthService.loginUser(payload)
    sendResponse(res, {
        httpStatusCode: 200,
        success: true,
        message: "User login successfully",
        data: result
    })
})
export const AuthController = {
    registerPatient,
    loginUser
}