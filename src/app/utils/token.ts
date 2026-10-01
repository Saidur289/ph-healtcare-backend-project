import crypto from "crypto";
import { CookieOptions, Response } from "express";
import { JwtPayload, SignOptions } from "jsonwebtoken";
import JwtUtils from "./jwt";
import { envVars } from "../config/env";
import CookieUtils from "./cookie";
import { durationToSeconds } from "./duration";

// Lifetimes come from .env (e.g. ACCESS_TOKEN_EXPIRES_IN=15m). Fallbacks: 15m / 7d / 1d.
export const ACCESS_TOKEN_TTL_SECONDS = durationToSeconds(
  envVars.ACCESS_TOKEN_EXPIRES_IN,
  15 * 60,
);
export const REFRESH_TOKEN_TTL_SECONDS = durationToSeconds(
  envVars.REFRESH_TOKEN_EXPIRES_IN,
  7 * 24 * 60 * 60,
);
export const SESSION_TTL_SECONDS = durationToSeconds(
  envVars.BETTER_AUTH_SESSION_TOKEN_EXPIRES_IN,
  24 * 60 * 60,
);
export const SESSION_UPDATE_AGE_SECONDS = durationToSeconds(
  envVars.BETTER_AUTH_SESSION_TOKEN_UPDATE_AGE,
  24 * 60 * 60,
);

const isProduction = envVars.NODE_ENV === "production";

// One place for auth cookie flags. "lax" blocks cross-site POSTs (CSRF) but still
// works for normal navigation; "secure" is required in production (HTTPS only).
export const authCookieOptions = (maxAgeSeconds?: number): CookieOptions => ({
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax",
  path: "/",
  ...(maxAgeSeconds !== undefined ? { maxAge: maxAgeSeconds * 1000 } : {}),
});

export type TAuthTokenUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  isDeleted: boolean;
  emailVerified: boolean;
  needPasswordChange?: boolean;
};

const buildPayload = (user: TAuthTokenUser, sessionId: string): JwtPayload => ({
  userId: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  status: user.status,
  isDeleted: user.isDeleted,
  emailVerified: user.emailVerified,
  // lets the client proxy force /change-password without an extra API call
  needPasswordChange: Boolean(user.needPasswordChange),
  // binds both tokens to one better-auth session
  sid: sessionId,
});

const getAccessToken = (user: TAuthTokenUser, sessionId: string) =>
  JwtUtils.createToken(buildPayload(user, sessionId), envVars.ACCESS_TOKEN_SECRET, {
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  } as SignOptions);

const getRefreshToken = (user: TAuthTokenUser, sessionId: string) =>
  JwtUtils.createToken(
    // jti makes every refresh token unique, so a reused (stolen) one can be detected
    { ...buildPayload(user, sessionId), jti: crypto.randomUUID() },
    envVars.REFRESH_TOKEN_SECRET,
    { expiresIn: REFRESH_TOKEN_TTL_SECONDS } as SignOptions,
  );

// we store only a hash of the refresh token, never the token itself
const hashToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

const setAccessTokenCookie = (res: Response, token: string) => {
  CookieUtils.setCookie(res, "accessToken", token, authCookieOptions(ACCESS_TOKEN_TTL_SECONDS));
};
const setRefreshTokenCookie = (res: Response, token: string) => {
  CookieUtils.setCookie(res, "refreshToken", token, authCookieOptions(REFRESH_TOKEN_TTL_SECONDS));
};
const setBetterAuthCookie = (res: Response, token: string) => {
  CookieUtils.setCookie(res, "better-auth.session_token", token, authCookieOptions(SESSION_TTL_SECONDS));
};
const setAuthCookies = (
  res: Response,
  tokens: { accessToken: string; refreshToken: string; sessionToken: string },
) => {
  setAccessTokenCookie(res, tokens.accessToken);
  setRefreshTokenCookie(res, tokens.refreshToken);
  setBetterAuthCookie(res, tokens.sessionToken);
};
const clearAuthCookies = (res: Response) => {
  ["accessToken", "refreshToken", "better-auth.session_token"].forEach((name) =>
    CookieUtils.clearCookie(res, name, authCookieOptions()),
  );
};

const TokenUtils = {
  getAccessToken,
  getRefreshToken,
  hashToken,
  setAccessTokenCookie,
  setRefreshTokenCookie,
  setBetterAuthCookie,
  setAuthCookies,
  clearAuthCookies,
};
export default TokenUtils;
