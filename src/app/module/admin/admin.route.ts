import { Router } from "express";

import { checkAuth } from "../../middleware/checkAuth";
import { Role } from "../../../generated/prisma/enums";
import { validateRequest } from "../../middleware/validateRequest";
import { AdminController } from "./admin.controller";
import { createUpdateAdminValidationZodSchema } from "./admin.validation";


const router = Router()
router.get("/", checkAuth(Role.ADMIN, Role.SUPER_ADMIN), AdminController.getAllAdmin);
router.get("/:id", checkAuth(Role.ADMIN, Role.SUPER_ADMIN), AdminController.getAdminById);
router.patch("/:id", checkAuth(Role.SUPER_ADMIN), validateRequest(createUpdateAdminValidationZodSchema), checkAuth(Role.ADMIN, Role.DOCTOR, Role.SUPER_ADMIN), AdminController.updateAdmin);
router.delete("/:id", checkAuth(Role.SUPER_ADMIN), AdminController.deleteDoctor)
export const AdminRoutes = router