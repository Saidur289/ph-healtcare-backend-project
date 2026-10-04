import { Router } from "express";
import { PatientController } from "./patient.controller";
import { checkAuth } from "../../middleware/checkAuth";
import { Role } from "../../../generated/prisma/enums";
import { multerUpload } from "../../config/multer.config";
import { updatePatientProfileMiddleware } from "./patient.middleware";
import { validateRequest } from "../../middleware/validateRequest";
import { PatientValidation } from "./patient.validation";

const router = Router();
// ADMIN: patient list (account status, no medical data)
router.get("/", checkAuth(Role.ADMIN, Role.SUPER_ADMIN), PatientController.getAllPatients);
router.patch(
  "/update-profile",
  checkAuth(Role.PATIENT),
  multerUpload.fields([
    {
      name: "profilePhoto",
      maxCount: 1,
    },
    // photo + 4 reports = the 5-file limit per request
    { name: "medicalReports", maxCount: 4 },
  ], { privateFields: ["medicalReports"] }),
  updatePatientProfileMiddleware,
  validateRequest(PatientValidation.updatePatientProfileZodSchema),
  PatientController.updateProfile,
);

export const PatientRoutes = router;
