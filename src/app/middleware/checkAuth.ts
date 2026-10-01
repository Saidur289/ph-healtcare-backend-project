import { NextFunction, Request, Response } from "express";
import CookieUtils from "../utils/cookie";
import AppError from "../errorHelpers/AppError";
import { StatusCodes } from "http-status-codes";
import { prisma } from "../lib/prisma";
import { Role, UserStatus } from "../../generated/prisma/enums";
import JwtUtils from "../utils/jwt";
import { envVars } from "../config/env";
import { JwtPayload } from "jsonwebtoken";

type TCheckAuthOptions = {
  // only for routes an unverified user must still reach (e.g. /auth/me, /auth/logout)
  allowUnverifiedEmail?: boolean;
};

// Fails CLOSED: every problem ends in 401/403, never in "let the request through".
// Source of truth = the better-auth session in the database (user, role, status).
// The access JWT must also be valid and belong to the same session/user.
const createCheckAuth =
  (authRoles: Role[], options: TCheckAuthOptions = {}) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionToken = CookieUtils.getCookie(req, "better-auth.session_token");
      const accessToken = CookieUtils.getCookie(req, "accessToken");
      if (!sessionToken || !accessToken) {
        throw new AppError(StatusCodes.UNAUTHORIZED, "Unauthorized - please log in");
      }

      // 1. session must exist and not be expired
      const session = await prisma.session.findFirst({
        where: {
          token: sessionToken,
          expiresAt: { gt: new Date() },
        },
        include: { user: true },
      });
      if (!session) {
        throw new AppError(StatusCodes.UNAUTHORIZED, "Session expired - please log in again");
      }

      // 2. access token must be valid and belong to this session's user
      const verified = JwtUtils.verifyToken(accessToken, envVars.ACCESS_TOKEN_SECRET);
      const payload = verified.data as JwtPayload | undefined;
      if (!verified.success || !payload) {
        throw new AppError(StatusCodes.UNAUTHORIZED, "Unauthorized - invalid or expired token");
      }
      if (payload.userId !== session.userId || (payload.sid && payload.sid !== session.id)) {
        throw new AppError(StatusCodes.UNAUTHORIZED, "Unauthorized - token does not match session");
      }

      // 3. account state is read from the DB, never trusted from the token
      const user = session.user;
      if (user.isDeleted || user.status === UserStatus.DELETED) {
        throw new AppError(StatusCodes.FORBIDDEN, "Forbidden - account is deleted");
      }
      if (user.status === UserStatus.BLOCKED) {
        throw new AppError(StatusCodes.FORBIDDEN, "Forbidden - account is blocked");
      }
      if (!user.emailVerified && !options.allowUnverifiedEmail) {
        throw new AppError(StatusCodes.FORBIDDEN, "Email is not verified");
      }
      if (authRoles.length > 0 && !authRoles.includes(user.role)) {
        throw new AppError(StatusCodes.FORBIDDEN, "Forbidden - you do not have access to this resource");
      }

      // tell the client when the session is close to expiry
      const lifetime = session.expiresAt.getTime() - session.createdAt.getTime();
      const timeLeft = session.expiresAt.getTime() - Date.now();
      if (lifetime > 0 && (timeLeft / lifetime) * 100 < 20) {
        res.setHeader("X-Session-Refresh", "true");
        res.setHeader("X-session-expires-at", session.expiresAt.toISOString());
      }

      req.user = {
        userId: user.id,
        email: user.email,
        role: user.role,
      };
      next();
    } catch (error) {
      next(error);
    }
  };

// checkAuth() = any logged-in, verified user; checkAuth(Role.ADMIN, ...) = only these roles
export const checkAuth = (...authRoles: Role[]) => createCheckAuth(authRoles);

// same checks, but an unverified email is allowed
export const checkAuthAllowUnverified = (...authRoles: Role[]) =>
  createCheckAuth(authRoles, { allowUnverifiedEmail: true });
