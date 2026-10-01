import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { multerUpload } from "../../config/multer.config";
import { checkAuth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { ProfileController } from "./profile.controller";
import { updateMyProfileZodSchema } from "./profile.validation";

const router = Router();
const everyone = [Role.PATIENT, Role.DOCTOR, Role.ADMIN, Role.SUPER_ADMIN];

router.get("/me", checkAuth(...everyone), ProfileController.getMyProfile);
// multipart: optional "profilePhoto" file + JSON fields in "data" (or plain JSON)
router.patch(
  "/me",
  checkAuth(...everyone),
  multerUpload.single("profilePhoto"),
  validateRequest(updateMyProfileZodSchema),
  ProfileController.updateMyProfile,
);

export const ProfileRoutes = router;
