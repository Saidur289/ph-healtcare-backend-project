import { envVars } from "../../config/env";
import { Request, Response } from "express";
import { catchAsync } from "../../shared/catchAsync";
import { AuthService, GENERIC_OTP_MESSAGE } from "./auth.service";
import { sendResponse } from "../../shared/sendResponse";
import TokenUtils from "../../utils/token";
import AppError from "../../errorHelpers/AppError";
import { StatusCodes } from "http-status-codes";

import { auth } from "../../lib/auth";

// Tokens are only ever sent as httpOnly cookies, never in a JSON body.

const registerPatient = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.registerPatient(req.body);
  sendResponse(res, {
    success: true,
    httpStatusCode: StatusCodes.CREATED,
    // same message whether the email was new or already registered
    message: "Please check your email for a verification code.",
    data: { email: result.email, emailVerificationRequired: true },
  });
});

const loginUser = catchAsync(async (req: Request, res: Response) => {
  const { user, tokens } = await AuthService.loginUser(req.body);
  TokenUtils.setAuthCookies(res, tokens);
  sendResponse(res, {
    httpStatusCode: StatusCodes.OK,
    success: true,
    message: "User login successfully",
    data: { user },
  });
});

const getMe = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.getMe(req.user);
  sendResponse(res, {
    httpStatusCode: StatusCodes.OK,
    success: true,
    message: "User profile fetched successfully",
    data: result,
  });
});

const getNewToken = catchAsync(async (req: Request, res: Response) => {
  const refreshToken = req.cookies["refreshToken"];
  const betterAuthSessionToken = req.cookies["better-auth.session_token"];
  if (!refreshToken) {
    throw new AppError(StatusCodes.UNAUTHORIZED, "Refresh token is missing");
  }
  const tokens = await AuthService.getNewToken(refreshToken, betterAuthSessionToken);
  TokenUtils.setAuthCookies(res, tokens);
  sendResponse(res, {
    httpStatusCode: StatusCodes.OK,
    success: true,
    message: "New tokens generated successfully",
  });
});

const changePassword = catchAsync(async (req: Request, res: Response) => {
  const betterAuthSessionToken = req.cookies["better-auth.session_token"];
  const tokens = await AuthService.changePassword(
    req.body,
    betterAuthSessionToken,
    req.user,
  );
  TokenUtils.setAuthCookies(res, tokens);
  sendResponse(res, {
    httpStatusCode: StatusCodes.OK,
    success: true,
    message: "Password changed successfully. Other devices have been logged out.",
  });
});

// works even with an expired session, so the user can always get rid of old cookies
const logoutUser = catchAsync(async (req: Request, res: Response) => {
  await AuthService.logoutUser(req.cookies["better-auth.session_token"]);
  TokenUtils.clearAuthCookies(res);
  sendResponse(res, {
    httpStatusCode: StatusCodes.OK,
    success: true,
    message: "Logged out successfully",
  });
});

const verifyEmail = catchAsync(async (req: Request, res: Response) => {
  const { email, otp } = req.body;
  await AuthService.verifyEmail(email, otp);
  sendResponse(res, {
    httpStatusCode: StatusCodes.OK,
    success: true,
    message: "Email verified successfully. You can now log in.",
  });
});

const resendVerificationOtp = catchAsync(async (req: Request, res: Response) => {
  await AuthService.resendVerificationOtp(req.body.email);
  sendResponse(res, {
    httpStatusCode: StatusCodes.OK,
    success: true,
    message: GENERIC_OTP_MESSAGE,
  });
});

const forgetPassword = catchAsync(async (req: Request, res: Response) => {
  await AuthService.forgetPassword(req.body.email);
  sendResponse(res, {
    httpStatusCode: StatusCodes.OK,
    success: true,
    message: GENERIC_OTP_MESSAGE,
  });
});

const resetPassword = catchAsync(async (req: Request, res: Response) => {
  const { email, otp, newPassword } = req.body;
  await AuthService.resetPassword(email, otp, newPassword);
  sendResponse(res, {
    httpStatusCode: StatusCodes.OK,
    success: true,
    message: "Password reset successfully. Please log in with your new password.",
  });
});

// only same-site relative paths ("/dashboard"), never "//evil.com" or "https://..."
const toSafeRedirectPath = (value: unknown, fallback = "/dashboard") => {
  const path = typeof value === "string" ? value : "";
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("\\")
    ? path
    : fallback;
};

const redirectToLoginWithError = (res: Response, error: string) =>
  res.redirect(`${envVars.FRONTEND_URL}/login?error=${encodeURIComponent(error)}`);

const googleLogin = catchAsync(async (req: Request, res: Response) => {
  const redirectPath = toSafeRedirectPath(req.query.redirect);
  const callbackUrl = `${envVars.BETTER_AUTH_URL}/api/v1/auth/google/success?redirect=${encodeURIComponent(redirectPath)}`;
  res.render("googleRedirect", {
    callbackUrl: callbackUrl,
    betterAuthUrl: envVars.BETTER_AUTH_URL,
  });
});

const googleLoginSuccess = catchAsync(async (req: Request, res: Response) => {
  const redirectPath = toSafeRedirectPath(req.query.redirect);
  const sessionToken = req.cookies["better-auth.session_token"];
  if (!sessionToken) {
    return redirectToLoginWithError(res, "no-session-found");
  }
  const session = await auth.api.getSession({
    headers: {
      Cookie: `better-auth.session_token=${sessionToken}`,
    },
  });
  if (!session?.user) {
    return redirectToLoginWithError(res, "no-user-found");
  }
  try {
    const tokens = await AuthService.googleLoginSuccess(session);
    TokenUtils.setAuthCookies(res, tokens);
  } catch {
    TokenUtils.clearAuthCookies(res);
    return redirectToLoginWithError(res, "account-unavailable");
  }
  res.redirect(`${envVars.FRONTEND_URL}${redirectPath}`);
});

const handleOauthError = catchAsync(async (req: Request, res: Response) => {
  const error = typeof req.query.error === "string" ? req.query.error : "oauth-error";
  redirectToLoginWithError(res, error);
});

export const AuthController = {
  registerPatient,
  loginUser,
  getMe,
  getNewToken,
  changePassword,
  logoutUser,
  verifyEmail,
  resendVerificationOtp,
  forgetPassword,
  resetPassword,
  googleLogin,
  googleLoginSuccess,
  handleOauthError,
};
