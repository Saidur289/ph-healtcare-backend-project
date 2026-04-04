import { Request, Response } from "express";
import { catchAsync } from "../../shared/catchAsync";
import { AuthService } from "./auth.service";
import { sendResponse } from "../../shared/sendResponse";
import TokenUtils from "../../utils/token";

const registerPatient = catchAsync(async (req: Request, res: Response) => {
    const payload = req.body;
    const result = await AuthService.registerPatient(payload)
    const { accessToken, token, refreshToken, ...rest } = result
    // console.log(result);
    TokenUtils.setAccessTokenCookie(res, accessToken)
    TokenUtils.setRefreshTokenCookie(res, refreshToken)
    TokenUtils.setBetterAuthCookie(res, token as string)

    sendResponse(res, {
        success: true,
        httpStatusCode: 201,
        message: "Patient registered successfully",
        data: { ...rest, accessToken, refreshToken, token }
    })
})

const loginUser = catchAsync(async (req: Request, res: Response) => {
    const payload = req.body
    const result = await AuthService.loginUser(payload)
    const { accessToken, token, refreshToken, ...rest } = result
    console.log(result);
    TokenUtils.setAccessTokenCookie(res, accessToken)
    TokenUtils.setRefreshTokenCookie(res, refreshToken)
    TokenUtils.setBetterAuthCookie(res, token as string)

    sendResponse(res, {
        httpStatusCode: 200,
        success: true,
        message: "User login successfully",
        data: { ...rest, accessToken, refreshToken, token }
    })
})
export const AuthController = {
    registerPatient,
    loginUser
}