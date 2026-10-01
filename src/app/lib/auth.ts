import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";
import { Role, UserStatus } from "../../generated/prisma/enums";
import { bearer, emailOTP } from "better-auth/plugins";
import { sendEmail } from "../utils/email";
import { envVars } from "../config/env";
import { SESSION_TTL_SECONDS, SESSION_UPDATE_AGE_SECONDS } from "../utils/token";

const isProduction = envVars.NODE_ENV === "production";
// same flags as our own auth cookies (utils/token.ts)
const cookieAttributes = {
  sameSite: "lax" as const,
  secure: isProduction,
  httpOnly: true,
};

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql", // or "mysql", "postgresql", ...etc
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    // same limits as passwordSchema in module/auth/auth.validation.ts
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },
  socialProviders: {
    google: {
      clientId: envVars.GOOGLE_CLIENT_ID,
      clientSecret: envVars.GOOGLE_SECRET_KEY,
      mapProfileToUser: (profile) => {
        return {
          name: profile.name,
          email: profile.email,
          role: Role.PATIENT,
          emailVerified: true,
          status: UserStatus.ACTIVE,
          needPasswordChange: false,
          isDeleted: false,
          deletedAt: null,
        };
      },
    },
  },
  emailVerification: {
    sendOnSignIn: true,
    sendOnSignUp: true,
    // the user logs in after verifying (our login issues the JWTs); no orphan sessions
    autoSignInAfterVerification: false,
  },

  user: {
    // input: false -> these fields can never be set from a sign-up request body
    // (always the default). Privileged values such as role are set by our own
    // services with prisma after sign-up (see user.service.ts and seed.ts).
    additionalFields: {
      role: {
        type: "string",
        required: true,
        defaultValue: Role.PATIENT,
        input: false,
      },
      status: {
        type: "string",
        required: true,
        defaultValue: UserStatus.ACTIVE,
        input: false,
      },
      needPasswordChange: {
        type: "boolean",
        required: true,
        defaultValue: false,
        input: false,
      },
      isDeleted: {
        type: "boolean",
        required: true,
        defaultValue: false,
        input: false,
      },
      deletedAt: {
        type: "date",
        required: false,
        defaultValue: null,
        input: false,
      },
    },
  },

  session: {
    // from .env: BETTER_AUTH_SESSION_TOKEN_EXPIRES_IN / _UPDATE_AGE (e.g. "1d")
    expiresIn: SESSION_TTL_SECONDS,
    updateAge: SESSION_UPDATE_AGE_SECONDS,
    cookieCache: {
      enabled: true,
      // short, so a revoked session stops working within minutes
      maxAge: 5 * 60,
    },
  },
  // better-auth's own limiter for its HTTP endpoints (only Google login is exposed, see app.ts)
  rateLimit: {
    enabled: true,
    window: 60,
    max: 30,
  },
  plugins: [
    bearer(),
    emailOTP({
      overrideDefaultEmailVerification: true,
      async sendVerificationOTP({ email, otp, type }) {
        if (type === "email-verification") {
          const user = await prisma.user.findUnique({
            where: {
              email,
            },
          });
          // the seeded super admin is verified by the seed, so it never needs an OTP
          if (!user || user.role === Role.SUPER_ADMIN || user.emailVerified) {
            return;
          }
          // catch: an SMTP failure must never become an unhandled rejection (that would stop the server).
          // The user can request a new code.
          sendEmail({
            to: email,
            subject: "verify your email",
            templateName: "otp",
            templateData: {
              name: user.name,
              otp,
            },
          }).catch((error) =>
            console.error("Failed to send verification OTP:", error?.message),
          );
        } else if (type === "forget-password") {
          const user = await prisma.user.findUnique({
            where: {
              email,
            },
          });
          if (user) {
            sendEmail({
              to: email,
              subject: "Password Reset OTP",
              templateName: "otp",
              templateData: {
                name: user.name,
                otp,
              },
            }).catch((error) =>
              console.error("Failed to send password reset OTP:", error?.message),
            );
          }
        }
      },
      expiresIn: 10 * 60, // 10 minutes
      otpLength: 6,
      allowedAttempts: 5, // then a new code must be requested
      storeOTP: "hashed", // the DB never holds a usable code
    }),
  ],
  redirectURLs: {
    signin: `${envVars.BETTER_AUTH_URL}/api/v1/auth/google/success`,
  },
  trustedOrigins: [
    process.env.BETTER_AUTH_URL || "http://localhost:5000",
    envVars.FRONTEND_URL,
  ],
  advanced: {
    // keep false: true would rename the cookie to "__Secure-better-auth.session_token",
    // and the API + client read "better-auth.session_token". "secure" is set below instead.
    useSecureCookies: false,
    cookies: {
      state: {
        attributes: cookieAttributes,
      },
      sessionToken: {
        attributes: cookieAttributes,
      },
    },
  },
});
