import { Router } from "express";
import { checkAuth } from "../../middleware/checkAuth";
import { AppointmentController } from "./appointment.controller";
import { Role } from "../../../generated/prisma/enums";

const router = Router();

router.post(
  "/book-appointment",
  checkAuth(Role.PATIENT),
  AppointmentController.bookAppointment,
);
router.get(
  "/my-appointments",
  checkAuth(Role.PATIENT, Role.DOCTOR),
  AppointmentController.getMyAppointment,
);
router.get(
  "/my-single-appointment/:id",
  checkAuth(Role.PATIENT, Role.DOCTOR),
  AppointmentController.getMySingleAppointment,
);
router.patch(
  "/change-appointment-status/:id",
  checkAuth(Role.DOCTOR, Role.PATIENT, Role.ADMIN, Role.SUPER_ADMIN),
  AppointmentController.changeAppointmentStatus,
);
router.post(
  "/book-appointment-with-pay-later",
  checkAuth(Role.PATIENT),
  AppointmentController.bookAppointmentWithPayLater,
);
router.post(
  "/initiate-payment/:id",
  checkAuth(Role.PATIENT),
  AppointmentController.initiatePayment,
);

export const AppointmentRoutes = router;
