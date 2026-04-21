import { envVars } from '../../config/env';
import { Request, Response } from "express";
import { catchAsync } from "../../shared/catchAsync";
import { AuthService } from "./auth.service";
import { sendResponse } from "../../shared/sendResponse";
import TokenUtils from "../../utils/token";
import AppError from "../../errorHelpers/AppError";
import { StatusCodes } from "http-status-codes";
import CookieUtils from "../../utils/cookie";

import { auth } from '../../lib/auth';

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
    const betterAuthSessionToken = req.cookies["better-auth.session_token"]
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
    const betterAuthSessionToken = req.cookies["better-auth.session_token"]
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
    const sessionToken = req.cookies["better-auth.session_token"]

    const result = await AuthService.logoutUser(sessionToken)
    if (result) {
        CookieUtils.clearCookie(res, "better-auth.session_token", {
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
const verifyEmail = catchAsync(async (req: Request, res: Response) => {
    const { email, otp } = req.body
    const result = await AuthService.verifyEmail(email, otp)
    sendResponse(res, {
        httpStatusCode: StatusCodes.OK,
        success: true,
        message: "Verify Email successfully",
        data: result,
    });
})
const forgetPassword = catchAsync(async (req: Request, res: Response) => {
    const { email } = req.body
    await AuthService.forgetPassword(email)
    sendResponse(res, {
        httpStatusCode: StatusCodes.OK,
        success: true,
        message: "Otp sent in your email",

    });
})
const resetPassword = catchAsync(async (req: Request, res: Response) => {
    const { email, otp, newPassword } = req.body
    const result = await AuthService.resetPassword(email, otp, newPassword)
    sendResponse(res, {
        httpStatusCode: StatusCodes.OK,
        success: true,
        message: "Password reset successfully",
        data: result,
    });
})
const googleLogin = catchAsync(async (req: Request, res: Response) => {
    const redirectURL = req.query.redirect || "/dashboard";
    console.log("redirecturl", redirectURL);
    const encodedRedirectURL = encodeURIComponent(redirectURL as string);
    const callbackUrl = `${envVars.BETTER_AUTH_URL}/api/v1/auth/google/success?redirect=${encodedRedirectURL}`;
    console.log(callbackUrl);
    console.log("google login start here...................");
    res.render("googleRedirect", {
        callbackUrl: callbackUrl,
        betterAuthUrl: envVars.BETTER_AUTH_URL
    })
    console.log("after render page sign in with google...........");
})
const googleLoginSuccess = catchAsync(async (req: Request, res: Response) => {
    console.log("after login successful.......... ");
    const redirectPath = req.query.redirect as string || "/dashboard";
    const sessionToken = req.cookies["better-auth.session_token"]
    console.log("better auth session", sessionToken);
    console.log("checking the sessionToken..................");
    if (!sessionToken) {
        return res.redirect(`${envVars.FRONTEND_URL}/auth/google?login?error=no-secret-found`)
    }
    console.log("validate the token with getsession api....................");
    const session = await auth.api.getSession({
        headers: {
            "Cookie": `better-auth.session_token=${sessionToken}`
        }
    })
    console.log("full session", session);
    if (!session) {
        return res.redirect(`${envVars.FRONTEND_URL}/auth/google?login?error=no-secret-found`)
    }
    if (session && !session.user) {
        return res.redirect(`${envVars.FRONTEND_URL}/auth/google?login?error=no-user-found`)
    }
    const result = await AuthService.googleLoginSuccess(session)
    const { accessToken, refreshToken } = result
    TokenUtils.setAccessTokenCookie(res, accessToken)
    TokenUtils.setRefreshTokenCookie(res, refreshToken)
    const isValidRedirectPath = redirectPath.startsWith("/") && !redirectPath.startsWith("//");
    const finalRedirectPath = isValidRedirectPath ? redirectPath : "/dashboard";
    console.log("Finally redirect user to the frontend......................");
    res.redirect(`${envVars.FRONTEND_URL}${finalRedirectPath}`);

})
const handleOauthError = catchAsync(async (req: Request, res: Response) => {
    const error = req.query.error || "oauth-error";
    res.redirect(`${envVars.FRONTEND_URL}/login?error=${error}`);
})
export const AuthController = {
    registerPatient,
    loginUser,
    getMe,
    getNewToken,
    changePassword,
    logoutUser,
    verifyEmail,
    forgetPassword,
    resetPassword,
    googleLogin,
    googleLoginSuccess,
    handleOauthError
}