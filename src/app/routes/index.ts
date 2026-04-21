import { Router } from "express";
import { SpecialtyRoutes } from "../module/specialty/specialty.route";
import { AuthRoutes } from "../module/auth/auth.route";
import { UserRoutes } from "../module/user/user.route";
import { DoctorRoutes } from "../module/doctor/doctor.route";
import { AdminRoutes } from "../module/admin/admin.route";
import { ScheduleRoutes } from "../module/schedule/schedule.route";

const router = Router()
router.use("/specialties", SpecialtyRoutes)
router.use("/auth", AuthRoutes)
router.use("/user", UserRoutes)
router.use("/doctors", DoctorRoutes)
router.use("/admins", AdminRoutes)
router.use("/schedules", ScheduleRoutes)

export const IndexRoutes = router