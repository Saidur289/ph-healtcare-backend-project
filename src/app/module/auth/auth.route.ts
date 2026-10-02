import { Router } from "express";
import { authPerEmailLimiter, authPerIpLimiter, passwordResetLimiter } from "../../middleware/security";
import { AuthController } from "./auth.controller";
import { checkAuth, checkAuthAllowUnverified } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { AuthValidation } from "./auth.validation";

const router = Router();
router.post("/register", authPerIpLimiter, authPerEmailLimiter, validateRequest(AuthValidation.registerZodSchema), AuthController.registerPatient);
router.post("/login", authPerIpLimiter, authPerEmailLimiter, validateRequest(AuthValidation.loginZodSchema), AuthController.loginUser);
// unverified users may read their own profile (the client uses it to send them to /verify-email)
router.get("/me", checkAuthAllowUnverified(), AuthController.getMe);
router.post("/refresh-token", AuthController.getNewToken);
// no checkAuth: logout must also work with an expired session
router.post("/logout", AuthController.logoutUser);
router.post("/change-password", authPerIpLimiter, checkAuth(), validateRequest(AuthValidation.changePasswordZodSchema), AuthController.changePassword);
router.post("/verify-email", authPerIpLimiter, authPerEmailLimiter, validateRequest(AuthValidation.verifyEmailZodSchema), AuthController.verifyEmail);
router.post("/resend-verification-otp", authPerIpLimiter, authPerEmailLimiter, validateRequest(AuthValidation.emailOnlyZodSchema), AuthController.resendVerificationOtp);
router.post("/forget-password", authPerIpLimiter, passwordResetLimiter, validateRequest(AuthValidation.emailOnlyZodSchema), AuthController.forgetPassword);
router.post("/reset-password", authPerIpLimiter, passwordResetLimiter, validateRequest(AuthValidation.resetPasswordZodSchema), AuthController.resetPassword);
router.get("/login/google", AuthController.googleLogin);
router.get("/google/success", AuthController.googleLoginSuccess);
router.get("/oauth/error", AuthController.handleOauthError);
export const AuthRoutes = router;
