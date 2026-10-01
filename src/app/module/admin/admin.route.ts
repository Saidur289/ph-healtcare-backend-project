import { Router } from "express";

import { checkAuth } from "../../middleware/checkAuth";
import { Role } from "../../../generated/prisma/enums";
import { validateRequest } from "../../middleware/validateRequest";
import { AdminController } from "./admin.controller";
import { AdminValidation, createUpdateAdminValidationZodSchema } from "./admin.validation";


const router = Router()
// registered before "/:id" so these paths are not treated as ids
router.patch("/change-user-status", checkAuth(Role.ADMIN, Role.SUPER_ADMIN), validateRequest(AdminValidation.changeUserStatusZodSchema), AdminController.changeUserStatus);
router.patch("/change-user-role", checkAuth(Role.SUPER_ADMIN), validateRequest(AdminValidation.changeUserRoleZodSchema), AdminController.changeUserRole);
router.get("/", checkAuth(Role.ADMIN, Role.SUPER_ADMIN), AdminController.getAllAdmin);
router.get("/:id", checkAuth(Role.ADMIN, Role.SUPER_ADMIN), AdminController.getAdminById);
router.patch("/:id", checkAuth(Role.SUPER_ADMIN), validateRequest(createUpdateAdminValidationZodSchema), AdminController.updateAdmin);
router.delete("/:id", checkAuth(Role.SUPER_ADMIN), AdminController.deleteAdmin)
export const AdminRoutes = router