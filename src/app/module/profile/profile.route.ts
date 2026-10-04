import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { multerUpload } from "../../config/multer.config";
import { checkAuth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { ProfileController } from "./profile.controller";
import { deleteMyAccountZodSchema, updateMyProfileZodSchema } from "./profile.validation";
import { bookingLimiter } from "../../middleware/security";

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

// privacy: download everything we hold, or delete the account (patients)
router.get("/me/export", checkAuth(Role.PATIENT), ProfileController.exportMyData);
router.delete(
  "/me",
  bookingLimiter,
  checkAuth(Role.PATIENT),
  validateRequest(deleteMyAccountZodSchema),
  ProfileController.deleteMyAccount,
);

export const ProfileRoutes = router;
