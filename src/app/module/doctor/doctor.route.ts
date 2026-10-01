import { Router } from "express";
import { DoctorController } from "./doctor.controller";
import { checkAuth } from "../../middleware/checkAuth";
import { Role } from "../../../generated/prisma/enums";
import { validateRequest } from "../../middleware/validateRequest";
import { doctorAvailabilityZodSchema, updateDoctorZodSchema } from "./doctor.validation";

const router = Router();
// admin routes must be registered before "/:id"
router.get(
  "/admin",
  checkAuth(Role.ADMIN, Role.SUPER_ADMIN),
  DoctorController.getAllDoctorsForAdmin,
);
router.get(
  "/admin/:id",
  checkAuth(Role.ADMIN, Role.SUPER_ADMIN),
  DoctorController.getDoctorByIdForAdmin,
);
// must be registered before "/:id"
router.patch(
  "/me/availability",
  checkAuth(Role.DOCTOR),
  validateRequest(doctorAvailabilityZodSchema),
  DoctorController.setMyAvailability,
);
// public (safe fields only)
router.get("/", DoctorController.getAllDoctors);
router.get("/:id", DoctorController.getDoctorById);
router.get("/:id/available-slots", DoctorController.getAvailableSlots);
router.patch(
  "/:id",
  checkAuth(Role.ADMIN, Role.DOCTOR, Role.SUPER_ADMIN),
  validateRequest(updateDoctorZodSchema),
  DoctorController.updateDoctor,
);
router.delete(
  "/:id",
  checkAuth(Role.ADMIN, Role.SUPER_ADMIN),
  DoctorController.deleteDoctor,
);
export const DoctorRoutes = router;
