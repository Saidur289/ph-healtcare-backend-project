import { Router } from "express";
import { checkAuth } from "../../middleware/checkAuth";
import { Role } from "../../../generated/prisma/enums";
import { DoctorScheduleController } from "./doctorSchedule.controller";

const router = Router()
router.post("/", checkAuth(Role.DOCTOR), DoctorScheduleController.createDoctorSchedule)
export const DoctorScheduleRoutes = router