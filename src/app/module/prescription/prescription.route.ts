import { Router } from "express";
import { PrescriptionController } from "./prescription.controller";
import { checkAuth } from "../../middleware/checkAuth";
import { Role } from "../../../generated/prisma/enums";
import { validateRequest } from "../../middleware/validateRequest";
import { PrescriptionValidation } from "./prescription.validation";

const router = Router();
router.get(
  "/",
  checkAuth(Role.ADMIN, Role.SUPER_ADMIN),
  PrescriptionController.getAllPrescriptions,
);
router.post(
  "/",
  checkAuth(Role.DOCTOR),
  validateRequest(PrescriptionValidation.createPrescriptionZodSchema),
  PrescriptionController.givePrescription,
);
router.get(
  "/my-prescriptions",
  checkAuth(Role.DOCTOR, Role.PATIENT),
  PrescriptionController.myPrescriptions,
);
router.put(
  "/:id",
  checkAuth(Role.DOCTOR),
  validateRequest(PrescriptionValidation.updatePrescriptionZodSchema),
  PrescriptionController.updatePrescription,
);
router.delete(
  "/:id",
  checkAuth(Role.DOCTOR),
  PrescriptionController.deletePrescription,
);

export const PrescriptionRoutes = router;
