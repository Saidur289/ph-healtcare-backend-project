import { Router } from "express";
import { SpecialtyRoutes } from "../modules/specialty/specialty.route";
import { AuthRoutes } from "../modules/auth/auth.route";
import { UserRoutes } from "../modules/user/user.route";

const router = Router()
router.use("/specialties", SpecialtyRoutes)
router.use("/auth", AuthRoutes)
router.use("/user", UserRoutes)
export const IndexRoutes = router