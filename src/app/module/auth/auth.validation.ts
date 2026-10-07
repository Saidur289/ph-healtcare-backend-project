import z from "zod";

// One password policy for every place a password is set (register, reset, change,
// admin-created doctors/admins). Keep it identical to client/src/zod/auth.validation.ts.
const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "12345678",
  "123456789",
  "1234567890",
  "qwerty123",
  "qwertyuiop",
  "11111111",
  "iloveyou1",
  "admin123",
  "welcome1",
  "abc12345",
  "letmein1",
]);

export const passwordSchema = z
  .string("Password is required")
  .min(8, "Password must be at least 8 characters long")
  .max(128, "Password must be at most 128 characters long")
  .regex(/[A-Za-z]/, "Password must contain at least one letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .refine((value) => !COMMON_PASSWORDS.has(value.toLowerCase()), {
    message: "This password is too common, please choose another one",
  });

const emailSchema = z
  .email("A valid email is required")
  .trim()
  .toLowerCase()
  .max(254, "Email is too long");

const otpSchema = z
  .string("OTP is required")
  .trim()
  .regex(/^\d{6}$/, "OTP must be 6 digits");

const registerZodSchema = z.strictObject({
  name: z
    .string("Name is required")
    .trim()
    .min(2, "Name must be at least 2 characters long")
    .max(60, "Name must be at most 60 characters long"),
  email: emailSchema,
  password: passwordSchema,
  // consent to the privacy policy and terms is required to create an account
  acceptTerms: z.literal(true, "Please accept the privacy policy and terms"),
});

const loginZodSchema = z.strictObject({
  email: emailSchema,
  // no policy check on login: old accounts may have older passwords
  password: z.string("Password is required").min(1, "Password is required").max(128),
});

const verifyEmailZodSchema = z.strictObject({
  email: emailSchema,
  otp: otpSchema,
});

const emailOnlyZodSchema = z.strictObject({
  email: emailSchema,
});

// the single-use code from the Google sign-in handoff (32 random bytes, base64url)
const googleExchangeZodSchema = z.strictObject({
  code: z.string().regex(/^[A-Za-z0-9_-]{43}$/, "Invalid code"),
});

const resetPasswordZodSchema = z.strictObject({
  email: emailSchema,
  otp: otpSchema,
  newPassword: passwordSchema,
});

const changePasswordZodSchema = z
  .strictObject({
    currentPassword: z.string("Current password is required").min(1).max(128),
    newPassword: passwordSchema,
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "New password must be different from the current password",
    path: ["newPassword"],
  });

export const AuthValidation = {
  registerZodSchema,
  loginZodSchema,
  verifyEmailZodSchema,
  emailOnlyZodSchema,
  resetPasswordZodSchema,
  changePasswordZodSchema,
  googleExchangeZodSchema,
};
