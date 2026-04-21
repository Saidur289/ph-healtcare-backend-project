import { Router } from "express";
import { SpecialtyController } from "./specialty.controller";
import { validateRequest } from "../../middleware/validateRequest";
import { SpecialtyValidation } from "./specialty.validation";
import { multerUpload } from "../../config/multer.config";
import { checkAuth } from "../../middleware/checkAuth";
import { Role } from "../../../generated/prisma/enums";

const router = Router()
router.post('/', checkAuth(Role.ADMIN, Role.SUPER_ADMIN), multerUpload.single("file"), validateRequest(SpecialtyValidation.createSpecialtyZodSchema), SpecialtyController.createSpecialty)
router.get("/", SpecialtyController.getAllSpecialties)
router.delete("/:id", SpecialtyController.deleteSpecialty)
export const SpecialtyRoutes = router