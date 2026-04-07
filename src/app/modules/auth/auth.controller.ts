import { Request, Response } from "express";
import { catchAsync } from "../../shared/catchAsync";
import { AuthService } from "./auth.service";
import { sendResponse } from "../../shared/sendResponse";
import TokenUtils from "../../utils/token";
import AppError from "../../errorHelpers/AppError";
import { StatusCodes } from "http-status-codes";
import CookieUtils from "../../utils/cookie";

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
const getMe = catchAsync(
    async (req: Request, res: Response) => {
        const user = req.user;
        console.log({ user });
        const result = await AuthService.getMe(user);
        sendResponse(res, {
            httpStatusCode: StatusCodes.OK,
            success: true,
            message: "User profile fetched successfully",
            data: result,
        })
    }
)
const getNewToken = catchAsync(async (req: Request, res: Response) => {
    const refreshToken = req.cookies.refreshToken
    const betterAuthSessionToken = req.cookies.betterAuthSessionToken
    if (!refreshToken) {
        throw new AppError(StatusCodes.UNAUTHORIZED, "Refresh token is missing")
    }
    const result = await AuthService.getNewToken(refreshToken, betterAuthSessionToken)
    const { accessToken, refreshToken: newRefreshToken, sessionToken } = result
    TokenUtils.setAccessTokenCookie(res, accessToken)
    TokenUtils.setRefreshTokenCookie(res, refreshToken)
    TokenUtils.setBetterAuthCookie(res, sessionToken)
    sendResponse(res, {
        httpStatusCode: StatusCodes.OK,
        success: true,
        message: "New tokens generated successfully",
        data: {
            accessToken,
            refreshToken: newRefreshToken,
            sessionToken,
        },
    });
})
const changePassword = catchAsync(async (req: Request, res: Response) => {
    const betterAuthSessionToken = req.cookies.betterAuthSessionToken
    const payload = req.body;
    const result = await AuthService.changePassword(payload, betterAuthSessionToken)
    const { accessToken, refreshToken, token } = result
    TokenUtils.setAccessTokenCookie(res, accessToken)
    TokenUtils.setRefreshTokenCookie(res, refreshToken)
    TokenUtils.setBetterAuthCookie(res, token as string)
    sendResponse(res, {
        httpStatusCode: StatusCodes.OK,
        success: true,
        message: "Password changed successfully",
        data: result,
    });
})
const logoutUser = catchAsync(async (req: Request, res: Response) => {
    const sessionToken = req.cookies.betterAuthSessionToken

    const result = await AuthService.logoutUser(sessionToken)
    if (result) {
        CookieUtils.clearCookie(res, "betterAuthSessionToken", {
            httpOnly: true,
            secure: true,
            sameSite: "none"
        })
        CookieUtils.clearCookie(res, "accessToken", {
            httpOnly: true,
            secure: true,
            sameSite: "none"
        })
        CookieUtils.clearCookie(res, "refreshToken", {
            httpOnly: true,
            secure: true,
            sameSite: "none"
        })
    }
    sendResponse(res, {
        httpStatusCode: StatusCodes.OK,
        success: true,
        message: "SignOut successfully",
        data: result,
    });
})
export const AuthController = {
    registerPatient,
    loginUser,
    getMe,
    getNewToken,
    changePassword,
    logoutUser
}