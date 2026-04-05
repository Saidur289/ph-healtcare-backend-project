import { Router } from "express";
import { SpecialtyRoutes } from "../modules/specialty/specialty.route";
import { AuthRoutes } from "../modules/auth/auth.route";
import { UserRoutes } from "../modules/user/user.route";
import { DoctorRoutes } from "../modules/doctor/doctor.route";
import { AdminRoutes } from "../modules/admin/admin.route";
import { SuperAdminRoutes } from "../modules/superAdmin/superAdmin.route";

const router = Router()
router.use("/specialties", SpecialtyRoutes)
router.use("/auth", AuthRoutes)
router.use("/user", UserRoutes)
router.use("/doctors", DoctorRoutes)
router.use("/admins", AdminRoutes)
router.use("/super-admins", SuperAdminRoutes)
export const IndexRoutes = router