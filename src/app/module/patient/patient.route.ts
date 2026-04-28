import { Router } from "express";
import { PatientController } from "./patient.controller";
import { checkAuth } from "../../middleware/checkAuth";
import { Role } from "../../../generated/prisma/enums";
import { multerUpload } from "../../config/multer.config";
import { updatePatientProfileMiddleware } from "./patient.middleware";
import { validateRequest } from "../../middleware/validateRequest";
import { PatientValidation } from "./patient.validation";

const router = Router();
router.patch(
  "/update-profile",
  checkAuth(Role.PATIENT),
  multerUpload.fields([
    {
      name: "profilePhoto",
      maxCount: 1,
    },
    { name: "medicalReports", maxCount: 5 },
  ]),
  updatePatientProfileMiddleware,
  validateRequest(PatientValidation.updatePatientProfileZodSchema),
  PatientController.updateProfile,
);

export const PatientRoutes = router;
