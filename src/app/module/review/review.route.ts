import { Router } from "express";
import { ReviewController } from "./review.controller";
import { checkAuth } from "../../middleware/checkAuth";
import { Role } from "../../../generated/prisma/enums";
import { validateRequest } from "../../middleware/validateRequest";
import { ReviewValidation } from "./review.validation";

const router = Router();
router.post(
  "/",
  checkAuth(Role.PATIENT),
  validateRequest(ReviewValidation.CreateReviewZodSchema),
  ReviewController.createReview,
);
router.get(
  "/my-reviews",
  checkAuth(Role.PATIENT, Role.DOCTOR),
  ReviewController.getMyReview,
);
router.get(
  "/",
  checkAuth(Role.ADMIN, Role.SUPER_ADMIN),
  ReviewController.getAllReview,
);
router.get(
  "/update-review/:id",
  checkAuth(Role.PATIENT),
  validateRequest(ReviewValidation.UpdateReviewZodSchema),
  ReviewController.updateReview,
);
router.delete(
  "/delete-review/:id",
  checkAuth(Role.PATIENT),
  ReviewController.deleteReview,
);
export const ReviewRoutes = router;
