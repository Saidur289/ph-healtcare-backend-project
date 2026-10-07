import { StatusCodes } from "http-status-codes";
import { audit } from "../../utils/audit";
import { APIError } from "better-auth/api";
import { UserStatus } from "../../../generated/prisma/enums";
import AppError from "../../errorHelpers/AppError";
import { auth } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import TokenUtils, {
  SESSION_TTL_SECONDS,
  TAuthTokenUser,
} from "../../utils/token";
import JwtUtils from "../../utils/jwt";
import { envVars } from "../../config/env";
import { JwtPayload } from "jsonwebtoken";
import {
  IChangePasswordPayload,
  ILoginUserPayload,
  IRegisterPatientPayload,
} from "./auth.interface";
import { IRequestUser } from "../../interface/requestUser.interface";
import { loginLimiter, otpResendLimiter } from "../../utils/attemptLimiter";
import { enqueueJob } from "../../utils/jobQueue";

// a session can be extended by refreshes, but never beyond this age
const SESSION_ABSOLUTE_MAX_MS = 30 * 24 * 60 * 60 * 1000;
// two tabs refreshing at the same moment is normal, not an attack
const REFRESH_RACE_GRACE_MS = 30 * 1000;

// Same answer whether the email exists or not (prevents account enumeration)
export const GENERIC_OTP_MESSAGE =
  "If an account with this email exists, we have sent a code to it.";

type TUserRow = TAuthTokenUser & {
  needPasswordChange: boolean;
  image?: string | null;
};

// the only user fields ever returned to the client after login
const toSafeUser = (user: TUserRow) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  status: user.status,
  emailVerified: user.emailVerified,
  needPasswordChange: user.needPasswordChange,
  image: user.image ?? null,
});

const assertAccountUsable = (user: { status: string; isDeleted: boolean }) => {
  if (user.isDeleted || user.status === UserStatus.DELETED) {
    throw new AppError(StatusCodes.FORBIDDEN, "This account has been deleted");
  }
  if (user.status === UserStatus.BLOCKED) {
    throw new AppError(StatusCodes.FORBIDDEN, "This account is blocked");
  }
};

// Creates our JWT pair for an existing better-auth session and remembers the refresh token hash
const issueTokensForSession = async (user: TAuthTokenUser, sessionToken: string) => {
  const session = await prisma.session.findUnique({
    where: { token: sessionToken },
    select: { id: true },
  });
  if (!session) {
    throw new AppError(StatusCodes.UNAUTHORIZED, "Session not found");
  }
  const accessToken = TokenUtils.getAccessToken(user, session.id);
  const refreshToken = TokenUtils.getRefreshToken(user, session.id);
  await prisma.session.update({
    where: { id: session.id },
    data: { refreshTokenHash: TokenUtils.hashToken(refreshToken) },
  });
  return { accessToken, refreshToken, sessionToken };
};

// true when the user can log in with a password (not only Google)
const hasPasswordAccount = async (userId: string) => {
  const account = await prisma.account.findFirst({
    where: { userId, providerId: "credential" },
    select: { id: true },
  });
  return Boolean(account);
};

const sendVerificationOtp = async (email: string) => {
  await auth.api
    .sendVerificationOTP({ body: { email, type: "email-verification" } })
    .catch((error) => console.error("Failed to send verification OTP:", error?.message));
};

// Registration never logs the user in: the email must be verified first.
// bump when the privacy policy / terms change in a way users must accept again
export const TERMS_VERSION = "2026-10-03";

const registerPatient = async (payload: IRegisterPatientPayload) => {
  const { name, email, password } = payload;

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    // don't reveal that the email is taken; help a user who lost their first code
    if (!existingUser.emailVerified && !existingUser.isDeleted && !otpResendLimiter.lockedFor(email)) {
      otpResendLimiter.fail(email);
      await sendVerificationOtp(email);
    }
    return { email };
  }

  const data = await auth.api.signUpEmail({
    body: { name, email, password },
  });
  try {
    await prisma.patient.create({
      data: {
        userId: data.user.id,
        name: data.user.name,
        email: data.user.email,
      },
    });
    // record the consent given at sign-up (the validator requires acceptTerms: true)
    await prisma.user.update({ where: { id: data.user.id }, data: { termsAcceptedAt: new Date(), termsVersion: TERMS_VERSION } });
  } catch (error) {
    await prisma.user.delete({ where: { id: data.user.id } }).catch(() => undefined);
    throw error;
  }
  otpResendLimiter.fail(email);
  return { email };
};

const loginUser = async (payload: ILoginUserPayload) => {
  const { email, password } = payload;

  const lockedForMs = loginLimiter.lockedFor(email);
  if (lockedForMs > 0) {
    throw new AppError(
      StatusCodes.TOO_MANY_REQUESTS,
      `Too many failed login attempts. Try again in ${Math.ceil(lockedForMs / 60000)} minute(s).`,
    );
  }

  let data;
  try {
    data = await auth.api.signInEmail({ body: { email, password } });
  } catch (error) {
    if (error instanceof APIError && error.body?.code === "EMAIL_NOT_VERIFIED") {
      // better-auth has just emailed a new code (sendOnSignIn)
      throw new AppError(StatusCodes.FORBIDDEN, "Email is not verified");
    }
    if (error instanceof APIError && error.statusCode === StatusCodes.UNAUTHORIZED) {
      const locked = loginLimiter.fail(email);
      // the user id if the account exists (the email itself is not logged)
      const known = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true, name: true } });
      await audit({ action: "auth.login_failed", actor: known ? { userId: known.id, role: known.role } : null, entityType: "User", entityId: known?.id, meta: { locked } });
      if (locked && known) {
        // tell the owner (plan.md 3.11); one email per lock, sent by the job queue with retries
        await enqueueJob(
          "email.send",
          {
            to: email,
            subject: "Logins to your account are paused for 15 minutes",
            templateName: "accountLocked",
            templateData: { name: known.name, minutes: 15, resetUrl: `${envVars.FRONTEND_URL}/forgot-password` },
          },
          { dedupeKey: `account-locked:${known.id}:${Math.floor(Date.now() / (15 * 60 * 1000))}` },
        );
      }
      throw new AppError(
        locked ? StatusCodes.TOO_MANY_REQUESTS : StatusCodes.UNAUTHORIZED,
        locked
          ? "Too many failed login attempts. Try again in 15 minutes."
          : "Invalid email or password",
      );
    }
    throw error;
  }
  loginLimiter.reset(email);

  try {
    assertAccountUsable(data.user);
  } catch (error) {
    // don't leave a usable session behind for a blocked/deleted account
    await prisma.session.deleteMany({ where: { token: data.token } });
    throw error;
  }

  const tokens = await issueTokensForSession(data.user, data.token);
  await audit({ action: "auth.login", actor: { userId: data.user.id, role: (data.user as { role?: string }).role }, entityType: "User", entityId: data.user.id });
  return { user: toSafeUser(data.user), tokens };
};

// Small profile for the navbar/sidebar/proxy (no appointments or prescriptions)
const getMe = async (user: IRequestUser) => {
  const profileSelect = {
    id: true,
    name: true,
    email: true,
    profilePhoto: true,
    contactNumber: true,
  } as const;
  const isUserExists = await prisma.user.findUnique({
    where: {
      id: user.userId,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      emailVerified: true,
      needPasswordChange: true,
      image: true,
      createdAt: true,
      Patient: { select: { ...profileSelect, address: true } },
      Doctor: { select: { ...profileSelect, designation: true, averageRating: true, isAvailable: true } },
      Admin: { select: profileSelect },
    },
  });
  if (!isUserExists) {
    throw new AppError(StatusCodes.NOT_FOUND, "user not found");
  }
  return isUserExists;
};

const getNewToken = async (refreshToken: string, sessionToken?: string) => {
  if (!sessionToken) {
    throw new AppError(StatusCodes.UNAUTHORIZED, "Session token is missing");
  }
  const session = await prisma.session.findUnique({
    where: { token: sessionToken },
    include: { user: true },
  });
  // an expired session can't be brought back to life
  if (!session || session.expiresAt <= new Date()) {
    throw new AppError(StatusCodes.UNAUTHORIZED, "Session expired - please log in again");
  }

  const verified = JwtUtils.verifyToken(refreshToken, envVars.REFRESH_TOKEN_SECRET);
  const payload = verified.data as JwtPayload | undefined;
  if (!verified.success || !payload) {
    throw new AppError(StatusCodes.UNAUTHORIZED, "Invalid refresh token");
  }
  // the refresh token must belong to this session and this user
  if (payload.userId !== session.userId || (payload.sid && payload.sid !== session.id)) {
    throw new AppError(StatusCodes.UNAUTHORIZED, "Invalid refresh token");
  }

  // rotation + reuse detection: only the latest refresh token of a session is valid
  const presentedHash = TokenUtils.hashToken(refreshToken);
  if (session.refreshTokenHash && session.refreshTokenHash !== presentedHash) {
    const justRotated = Date.now() - session.updatedAt.getTime() < REFRESH_RACE_GRACE_MS;
    if (!justRotated) {
      // an old token came back: assume it was stolen and end every session of this user
      await prisma.session.deleteMany({ where: { userId: session.userId } });
    }
    throw new AppError(StatusCodes.UNAUTHORIZED, "Refresh token is no longer valid - please log in again");
  }

  // role/status always come from the DB, so a blocked or demoted user can't keep refreshing
  const user = session.user;
  try {
    assertAccountUsable(user);
  } catch (error) {
    await prisma.session.deleteMany({ where: { userId: user.id } });
    throw error;
  }

  const newAccessToken = TokenUtils.getAccessToken(user, session.id);
  const newRefreshToken = TokenUtils.getRefreshToken(user, session.id);
  // sliding expiry for active users, capped at an absolute maximum session age
  const newExpiresAt = new Date(
    Math.min(
      Date.now() + SESSION_TTL_SECONDS * 1000,
      session.createdAt.getTime() + SESSION_ABSOLUTE_MAX_MS,
    ),
  );
  await prisma.session.update({
    where: { id: session.id },
    data: {
      refreshTokenHash: TokenUtils.hashToken(newRefreshToken),
      expiresAt: newExpiresAt > session.expiresAt ? newExpiresAt : session.expiresAt,
    },
  });
  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    sessionToken,
  };
};

const changePassword = async (
  payload: IChangePasswordPayload,
  sessionToken: string,
  requestUser: IRequestUser,
) => {
  if (!(await hasPasswordAccount(requestUser.userId))) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "This account signs in with Google and has no password to change",
    );
  }
  const { currentPassword, newPassword } = payload;
  // revokeOtherSessions: every other device is logged out; better-auth returns a new session token
  const result = await auth.api.changePassword({
    body: {
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    },
    headers: new Headers({
      Authorization: `Bearer ${sessionToken}`,
    }),
  });
  const user = await prisma.user.update({
    where: { id: requestUser.userId },
    data: { needPasswordChange: false },
  });
  await audit({ action: "auth.password_changed", actor: { userId: user.id, role: user.role }, entityType: "User", entityId: user.id });
  return issueTokensForSession(user, result.token ?? sessionToken);
};

const logoutUser = async (sessionToken?: string) => {
  if (!sessionToken) return;
  // who is logging out (read before better-auth removes the session)
  const session = await prisma.session.findUnique({ where: { token: sessionToken }, select: { userId: true } });
  await auth.api
    .signOut({ headers: { authorization: `Bearer ${sessionToken}` } })
    .catch(() => undefined);
  // make sure the session row is gone even if better-auth could not find it
  await prisma.session.deleteMany({ where: { token: sessionToken } });
  if (session) await audit({ action: "auth.logout", actor: { userId: session.userId }, entityType: "User", entityId: session.userId });
};

const verifyEmail = async (email: string, otp: string) => {
  // invalid / expired / too many attempts -> better-auth throws an APIError (4xx)
  const result = await auth.api.verifyEmailOTP({
    body: {
      email,
      otp,
    },
  });
  if (result.status && !result.user.emailVerified) {
    await prisma.user.update({
      where: { email },
      data: { emailVerified: true },
    });
  }
  return result.status;
};

const assertNotInCooldown = (email: string) => {
  const waitMs = otpResendLimiter.lockedFor(email);
  if (waitMs > 0) {
    throw new AppError(
      StatusCodes.TOO_MANY_REQUESTS,
      `Please wait ${Math.ceil(waitMs / 1000)} seconds before requesting a new code`,
    );
  }
  otpResendLimiter.fail(email);
};

const resendVerificationOtp = async (email: string) => {
  assertNotInCooldown(email);
  const user = await prisma.user.findUnique({ where: { email } });
  if (user && !user.emailVerified && !user.isDeleted) {
    await sendVerificationOtp(email);
  }
};

const forgetPassword = async (email: string) => {
  assertNotInCooldown(email);
  const user = await prisma.user.findUnique({ where: { email } });
  // every "can't reset" case gets the same answer as success (no account enumeration)
  if (
    !user ||
    !user.emailVerified ||
    user.isDeleted ||
    user.status !== UserStatus.ACTIVE ||
    !(await hasPasswordAccount(user.id))
  ) {
    return;
  }
  await auth.api
    .requestPasswordResetEmailOTP({ body: { email } })
    .catch((error) => console.error("Failed to request password reset OTP:", error?.message));
};

const resetPassword = async (
  email: string,
  otp: string,
  newPassword: string,
) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.isDeleted || user.status === UserStatus.DELETED) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Invalid or expired code");
  }
  const result = await auth.api.resetPasswordEmailOTP({
    body: {
      email,
      otp,
      password: newPassword,
    },
  });
  if (result.success) {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { needPasswordChange: false },
      }),
      // log out everywhere after a password reset
      prisma.session.deleteMany({ where: { userId: user.id } }),
    ]);
    await audit({ action: "auth.password_reset", actor: { userId: user.id, role: user.role }, entityType: "User", entityId: user.id });
  }
  return result.success;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const googleLoginSuccess = async (session: Record<string, any>) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });
  assertAccountUsable(user);
  const isPatientExists = await prisma.patient.findUnique({
    where: { userId: user.id },
  });
  if (!isPatientExists && user.role === "PATIENT") {
    await prisma.patient.create({
      data: {
        userId: user.id,
        name: user.name,
        email: user.email,
      },
    });
  }
  return issueTokensForSession(user, session.session.token);
};

export const AuthService = {
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
  googleLoginSuccess,
};
