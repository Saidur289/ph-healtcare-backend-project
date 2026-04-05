import { Router } from "express";

import { checkAuth } from "../../middleware/checkAuth";
import { Role } from "../../../generated/prisma/enums";
import { validateRequest } from "../../middleware/validateRequest";
import { SuperAdminController } from "./superAdmin.controller";
import { createUpdateSuperAdminValidationZodSchema } from "./super.validation";



const router = Router()
router.get("/", checkAuth(Role.ADMIN, Role.DOCTOR, Role.SUPER_ADMIN), SuperAdminController.getAllSuperAdmin);
router.get("/:id", checkAuth(Role.ADMIN, Role.DOCTOR, Role.SUPER_ADMIN), SuperAdminController.getSuperAdminById);
router.patch("/:id", validateRequest(createUpdateSuperAdminValidationZodSchema), checkAuth(Role.ADMIN, Role.DOCTOR, Role.SUPER_ADMIN), SuperAdminController.updateSuperAdmin);
router.patch("/:id", checkAuth(Role.ADMIN, Role.SUPER_ADMIN), SuperAdminController.deleteSuperAdmin)
export const SuperAdminRoutes = router