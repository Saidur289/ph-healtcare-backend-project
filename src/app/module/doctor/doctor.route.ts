import { Router } from "express";
import { DoctorController } from "./doctor.controller";
import { checkAuth } from "../../middleware/checkAuth";
import { Role } from "../../../generated/prisma/enums";
import { validateRequest } from "../../middleware/validateRequest";
import { createUpdateDoctorValidationZodSchema } from "./doctor.validation";

const router = Router()
router.get("/", DoctorController.getAllDoctors);
router.get("/:id", checkAuth(Role.ADMIN, Role.DOCTOR, Role.SUPER_ADMIN), DoctorController.getDoctorById);
router.patch("/:id", validateRequest(createUpdateDoctorValidationZodSchema), checkAuth(Role.ADMIN, Role.DOCTOR, Role.SUPER_ADMIN), DoctorController.updateDoctor);
router.patch("/:id", checkAuth(Role.ADMIN, Role.SUPER_ADMIN), DoctorController.deleteDoctor)
export const DoctorRoutes = router