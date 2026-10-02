// load .env here, not only in lib/prisma.ts: whichever module imports env first must see the values
import "dotenv/config";
import { z } from "zod";

// Validated once at startup: a missing or malformed value stops the server with a clear list.
// (JWT_SECRET_KEY, JWT_EXPIRES_IN and GOOGLE_CALLBACK_URL were never read and are no longer required.)
const text = z.string().trim().min(1, "is required");
const url = z.url("must be a full URL (https://...)");
const duration = z.string().regex(/^\d+[smhd]$/, 'must look like "15m", "7d" or "1h"');
// production secrets: at least 32 random characters (e.g. `openssl rand -base64 32`)
const secret = text;

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]),
  PORT: z.string().regex(/^\d+$/, "must be a port number"),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, "must be a postgres:// connection string"),
  FRONTEND_URL: url,
  BETTER_AUTH_URL: url,
  BETTER_AUTH_SECRET: secret,
  ACCESS_TOKEN_SECRET: secret,
  REFRESH_TOKEN_SECRET: secret,
  ACCESS_TOKEN_EXPIRES_IN: duration,
  REFRESH_TOKEN_EXPIRES_IN: duration,
  BETTER_AUTH_SESSION_TOKEN_EXPIRES_IN: duration,
  BETTER_AUTH_SESSION_TOKEN_UPDATE_AGE: duration,
  EMAIL_SENDER_USER_PASS: text,
  EMAIL_SENDER_USER_USER: text,
  EMAIL_SENDER_USER_SMTP_HOST: text,
  EMAIL_SENDER_USER_SMTP_PORT: z.string().regex(/^\d+$/, "must be a port number"),
  EMAIL_SENDER_USER_SMTP_FROM: text,
  GOOGLE_CLIENT_ID: text,
  GOOGLE_SECRET_KEY: text,
  CLOUDINARY_CLOUD_NAME: text,
  CLOUDINARY_API_KEY: text,
  CLOUDINARY_API_SECRET: text,
  STRIPE_SECRET_KEY: z.string().regex(/^sk_(test|live)_/, "must be a Stripe secret key (sk_test_... / sk_live_...)"),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_", "must start with whsec_"),
  SUPER_ADMIN_EMAIL: z.email("must be an email"),
  SUPER_ADMIN_PASSWORD: text,
  SUPER_ADMIN_NAME: text,
  ALLOW_STRIPE_TEST_IN_PRODUCTION: z.enum(["true", "false"]).optional(),
});

const fail = (lines: string[]) => {
  // plain Error: this runs before the app (and its error handler) exists
  throw new Error(`Invalid environment configuration:\n${lines.map((l) => `  - ${l}`).join("\n")}`);
};

const loadEnvVariables = () => {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    fail(parsed.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`));
  }
  const env = parsed.data!;
  const isProduction = env.NODE_ENV === "production";

  // secrets: long, random and all different. Hard error in production, warning elsewhere.
  const secrets = { BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET, ACCESS_TOKEN_SECRET: env.ACCESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET: env.REFRESH_TOKEN_SECRET };
  const secretProblems = [
    ...Object.entries(secrets)
      .filter(([, value]) => value.length < 32)
      .map(([key]) => `${key} must be at least 32 characters (generate one with: openssl rand -base64 32)`),
    ...(new Set(Object.values(secrets)).size < 3 ? ["BETTER_AUTH_SECRET, ACCESS_TOKEN_SECRET and REFRESH_TOKEN_SECRET must all be different"] : []),
  ];
  if (secretProblems.length) {
    if (isProduction) fail(secretProblems);
    console.warn(`[env] weak secrets (allowed outside production):\n  - ${secretProblems.join("\n  - ")}`);
  }

  // Never mix Stripe modes: live keys only in production, test keys everywhere else
  if (isProduction && !env.STRIPE_SECRET_KEY.startsWith("sk_live_") && env.ALLOW_STRIPE_TEST_IN_PRODUCTION !== "true") {
    fail(["Production must use a live Stripe key (sk_live_...). Set ALLOW_STRIPE_TEST_IN_PRODUCTION=true only for a staging server."]);
  }
  if (!isProduction && env.STRIPE_SECRET_KEY.startsWith("sk_live_")) {
    fail(["A live Stripe key (sk_live_...) is not allowed outside production. Use a test key (sk_test_...)."]);
  }
  if (isProduction && !env.FRONTEND_URL.startsWith("https://")) {
    fail(["FRONTEND_URL must use https:// in production"]);
  }

  // same shape as before, so the rest of the code is unchanged
  return {
    PORT: env.PORT,
    NODE_ENV: env.NODE_ENV,
    DATABASE_URL: env.DATABASE_URL,
    FRONTEND_URL: env.FRONTEND_URL,
    BETTER_AUTH_URL: env.BETTER_AUTH_URL,
    BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET,
    ACCESS_TOKEN_SECRET: env.ACCESS_TOKEN_SECRET,
    REFRESH_TOKEN_SECRET: env.REFRESH_TOKEN_SECRET,
    ACCESS_TOKEN_EXPIRES_IN: env.ACCESS_TOKEN_EXPIRES_IN,
    REFRESH_TOKEN_EXPIRES_IN: env.REFRESH_TOKEN_EXPIRES_IN,
    BETTER_AUTH_SESSION_TOKEN_EXPIRES_IN: env.BETTER_AUTH_SESSION_TOKEN_EXPIRES_IN,
    BETTER_AUTH_SESSION_TOKEN_UPDATE_AGE: env.BETTER_AUTH_SESSION_TOKEN_UPDATE_AGE,
    Email_Sender: {
      EMAIL_SENDER_USER_PASS: env.EMAIL_SENDER_USER_PASS,
      EMAIL_SENDER_USER_USER: env.EMAIL_SENDER_USER_USER,
      EMAIL_SENDER_USER_SMTP_HOST: env.EMAIL_SENDER_USER_SMTP_HOST,
      EMAIL_SENDER_USER_SMTP_PORT: env.EMAIL_SENDER_USER_SMTP_PORT,
      EMAIL_SENDER_USER_SMTP_FROM: env.EMAIL_SENDER_USER_SMTP_FROM,
    },
    GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID,
    GOOGLE_SECRET_KEY: env.GOOGLE_SECRET_KEY,
    CLOUDINARY: {
      CLOUDINARY_CLOUD_NAME: env.CLOUDINARY_CLOUD_NAME,
      CLOUDINARY_API_KEY: env.CLOUDINARY_API_KEY,
      CLOUDINARY_API_SECRET: env.CLOUDINARY_API_SECRET,
    },
    STRIPE: {
      STRIPE_SECRET_KEY: env.STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET: env.STRIPE_WEBHOOK_SECRET,
    },
    SUPER_ADMIN_EMAIL: env.SUPER_ADMIN_EMAIL,
    SUPER_ADMIN_PASSWORD: env.SUPER_ADMIN_PASSWORD,
    SUPER_ADMIN_NAME: env.SUPER_ADMIN_NAME,
  };
};

export const envVars = loadEnvVariables();
