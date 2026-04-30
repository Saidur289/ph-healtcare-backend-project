import { Router } from "express";
import { PrescriptionController } from "./prescription.controller";
import { checkAuth } from "../../middleware/checkAuth";
import { Role } from "../../../generated/prisma/enums";

const router = Router();
router.get(
  "/",
  checkAuth(Role.ADMIN, Role.SUPER_ADMIN),
  PrescriptionController.getAllPrescriptions,
);
router.post(
  "/",
  checkAuth(Role.DOCTOR),
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
  PrescriptionController.updatePrescription,
);
router.delete(
  "/:id",
  checkAuth(Role.DOCTOR),
  PrescriptionController.deletePrescription,
);

export const PrescriptionRoutes = router;
