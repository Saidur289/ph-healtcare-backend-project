import { Router } from "express";
import { UserController } from "./user.controller";
import { validateRequest } from "../../middleware/validateRequest";
import { UserValidation } from "./user.validation";


const router = Router()
router.post("/create-doctor", validateRequest(UserValidation.createDoctorZodSchema), UserController.createDoctor)
router.post("/create-admin", validateRequest(UserValidation.createAdminValidationSchema), UserController.createAdmin)
router.post("/create-super-admin", validateRequest(UserValidation.createSuperAdminValidationSchema), UserController.createSuperAdmin)
// router.post("/create-admin", checkAuth(Role.ADMIN, Role.SUPER_ADMIN, Role.DOCTOR, Role.PATIENT), validateRequest(UserValidation.createAdminValidationSchema), UserController.createAdmin)
export const UserRoutes = router