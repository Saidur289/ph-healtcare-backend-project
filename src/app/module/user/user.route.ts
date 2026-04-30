import { Router } from "express";
import { UserController } from "./user.controller";
import { validateRequest } from "../../middleware/validateRequest";
import { UserValidation } from "./user.validation";
import { checkAuth } from "../../middleware/checkAuth";
import { Role } from "../../../generated/prisma/enums";

const router = Router();
router.post(
  "/create-doctor",
  checkAuth(Role.ADMIN, Role.SUPER_ADMIN),
  validateRequest(UserValidation.createDoctorZodSchema),
  UserController.createDoctor,
);
router.post(
  "/create-admin",
  validateRequest(UserValidation.createAdminValidationSchema),
  UserController.createAdmin,
);
export const UserRoutes = router;
