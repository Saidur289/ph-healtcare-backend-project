import { Router } from "express";
import { checkAuth } from "../../middleware/checkAuth";
import { Role } from "../../../generated/prisma/enums";
import { validateRequest } from "../../middleware/validateRequest";
import { ScheduleValidation } from "./schedule.validation";
import { ScheduleController } from "./schedule.controller";

const router = Router()
router.post("/", checkAuth(Role.ADMIN, Role.SUPER_ADMIN), validateRequest(ScheduleValidation.createScheduleZodSchema), ScheduleController.createSchedule)
router.get("/", checkAuth(Role.ADMIN, Role.SUPER_ADMIN, Role.DOCTOR), ScheduleController.getAllSchedules)
export const ScheduleRoutes = router