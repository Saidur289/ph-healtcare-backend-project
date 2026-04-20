import { Router } from "express";
import { SpecialtyController } from "./specialty.controller";
import { validateRequest } from "../../middleware/validateRequest";
import { SpecialtyValidation } from "./specialty.validation";
import { multerUpload } from "../../config/multer.config";

const router = Router()
router.post('/', multerUpload.single("file"), validateRequest(SpecialtyValidation.createSpecialtyZodSchema), SpecialtyController.createSpecialty)
router.get("/", SpecialtyController.getAllSpecialties)
router.delete("/:id", SpecialtyController.deleteSpecialty)
export const SpecialtyRoutes = router