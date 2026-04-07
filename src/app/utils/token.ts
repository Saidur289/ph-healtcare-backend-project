import { JwtPayload, SignOptions } from "jsonwebtoken";
import JwtUtils from "./jwt";
import { envVars } from "../config/env";
import CookieUtils from "./cookie";
import { Response } from "express";

const getAccessToken = (payload: JwtPayload) => {

    const accessToken = JwtUtils.createToken(payload, envVars.ACCESS_TOKEN_SECRET, { expiresIn: envVars.ACCESS_TOKEN_EXPIRES_IN } as SignOptions);
    return accessToken;
}
const getRefreshToken = (payload: JwtPayload) => {
    const refreshToken = JwtUtils.createToken(payload, envVars.REFRESH_TOKEN_SECRET, { expiresIn: envVars.REFRESH_TOKEN_EXPIRES_IN } as SignOptions);
    return refreshToken;
}
const setAccessTokenCookie = (res: Response, token: string) => {
    CookieUtils.setCookie(res, "accessToken", token, {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        path: "/",
        maxAge: 60 * 60 * 24 * 1000 // 1 day
    })
}
const setRefreshTokenCookie = (res: Response, token: string) => {
    CookieUtils.setCookie(res, "refreshToken", token, {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        path: "/",
        maxAge: 60 * 60 * 24 * 1000 * 7 // 1 week
    })
}
const setBetterAuthCookie = (res: Response, token: string) => {
    CookieUtils.setCookie(res, "betterAuthSessionToken", token, {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        path: "/",
        maxAge: 60 * 60 * 24 * 1000 // 1 day
    })
}

const TokenUtils = {
    getAccessToken,
    getRefreshToken,
    setAccessTokenCookie,
    setRefreshTokenCookie,
    setBetterAuthCookie
}
export default TokenUtils;