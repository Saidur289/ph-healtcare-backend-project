import { NextFunction, Request, Response } from "express"
import CookieUtils from "../utils/cookie";
import AppError from "../errorHelpers/AppError";
import { StatusCodes } from "http-status-codes";
import { prisma } from "../lib/prisma";
import { Role, UserStatus } from "../../generated/prisma/enums";
import JwtUtils from "../utils/jwt";
import { envVars } from "../config/env";
import { JwtPayload } from "jsonwebtoken";


export const checkAuth = (...authRoles: Role[]) => async (req: Request, res: Response, next: NextFunction) => {
    try {
        const sessionToken = CookieUtils.getCookie(req, "better-auth.session_token");
        // console.log(sessionToken);
        if (!sessionToken) {
            throw new AppError(StatusCodes.UNAUTHORIZED, "Unauthorized - No session token provided");
        }
        if (sessionToken) {
            const sessionExists = await prisma.session.findFirst({
                where: {
                    token: sessionToken,
                    expiresAt: {
                        gt: new Date()
                    }
                },
                include: {
                    user: true
                }

            })
            if (sessionExists) {
                const user = sessionExists.user;
                // console.log(user, "hello user");
                const now = new Date();
                const expiresAt = new Date(sessionExists.expiresAt);
                const createdAt = new Date(sessionExists.createdAt);
                const sessionLifeTime = expiresAt.getTime() - createdAt.getTime();
                const timeLeft = expiresAt.getTime() - now.getTime();
                const percentRemaining = (timeLeft / sessionLifeTime) * 100;
                if (percentRemaining < 20) {
                    res.setHeader("X-Session-Refresh", "true");
                    res.setHeader("X-session-expires-at", expiresAt.toISOString());
                    res.setHeader("X-session-remaining-percent", percentRemaining.toString());
                    console.log("session expiring soon");
                }

                if (user.status === UserStatus.BLOCKED || user.status === UserStatus.DELETED) {
                    throw new AppError(StatusCodes.UNAUTHORIZED, "Unauthorized - User is blocked or deleted");
                }
                if (user.isDeleted) {
                    throw new AppError(StatusCodes.FORBIDDEN, "Forbidden - User is deleted");
                }
                if (authRoles.length > 0 && !authRoles.includes(user.role)) {
                    throw new AppError(StatusCodes.FORBIDDEN, "Forbidden - User does not have the required role");
                }
                req.user = {
                    userId: user.id,
                    email: user.email,
                    role: user.role
                }
            }

        }
        const accessToken = CookieUtils.getCookie(req, "accessToken");

        if (!accessToken) {
            throw new AppError(StatusCodes.UNAUTHORIZED, "Unauthorized")
        }
        const verifyToken = JwtUtils.verifyToken(accessToken, envVars.ACCESS_TOKEN_SECRET as string)
        const data = verifyToken.data as JwtPayload

        if (!verifyToken) {
            throw new AppError(StatusCodes.UNAUTHORIZED, "Unauthorized - Invalid token")
        }
        if (authRoles.length > 0 && !authRoles.includes(data.role! as Role)) {
            throw new AppError(StatusCodes.FORBIDDEN, "Forbidden - User does not have the required role")
        }

        next();
    } catch (error) {
        next(error);
    }
}