import { Router } from "express";
import { AuthController } from "./auth.controller";
import { Role } from "../../../generated/prisma/enums";
import { checkAuth } from "../../middleware/checkAuth";

const router = Router()
router.post("/register", AuthController.registerPatient);
router.post("/login", AuthController.loginUser);
router.get("/me", checkAuth(Role.ADMIN, Role.DOCTOR, Role.PATIENT, Role.SUPER_ADMIN), AuthController.getMe)
router.post("/refresh-token", AuthController.getNewToken)
router.post("/logout", checkAuth(), AuthController.logoutUser)
router.post("/change-password", checkAuth(Role.ADMIN, Role.DOCTOR, Role.PATIENT, Role.SUPER_ADMIN), AuthController.changePassword)
export const AuthRoutes = router