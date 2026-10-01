import { Router } from "express";
import { AuthController } from "./auth.controller";
import { checkAuth, checkAuthAllowUnverified } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { AuthValidation } from "./auth.validation";

const router = Router();
router.post("/register", validateRequest(AuthValidation.registerZodSchema), AuthController.registerPatient);
router.post("/login", validateRequest(AuthValidation.loginZodSchema), AuthController.loginUser);
// unverified users may read their own profile (the client uses it to send them to /verify-email)
router.get("/me", checkAuthAllowUnverified(), AuthController.getMe);
router.post("/refresh-token", AuthController.getNewToken);
// no checkAuth: logout must also work with an expired session
router.post("/logout", AuthController.logoutUser);
router.post("/change-password", checkAuth(), validateRequest(AuthValidation.changePasswordZodSchema), AuthController.changePassword);
router.post("/verify-email", validateRequest(AuthValidation.verifyEmailZodSchema), AuthController.verifyEmail);
router.post("/resend-verification-otp", validateRequest(AuthValidation.emailOnlyZodSchema), AuthController.resendVerificationOtp);
router.post("/forget-password", validateRequest(AuthValidation.emailOnlyZodSchema), AuthController.forgetPassword);
router.post("/reset-password", validateRequest(AuthValidation.resetPasswordZodSchema), AuthController.resetPassword);
router.get("/login/google", AuthController.googleLogin);
router.get("/google/success", AuthController.googleLoginSuccess);
router.get("/oauth/error", AuthController.handleOauthError);
export const AuthRoutes = router;
