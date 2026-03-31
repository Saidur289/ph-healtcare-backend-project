import { Router } from "express";
import { SpecialtyRoutes } from "../modules/specialty/specialty.route";
import { AuthRoutes } from "../modules/auth/auth.route";

const router = Router()
router.use("/specialties", SpecialtyRoutes)
router.use("/auth", AuthRoutes)
export const IndexRoutes = router