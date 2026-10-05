import { Router } from "express";
import { bookingLimiter } from "../../middleware/security";
import { checkAuth } from "../../middleware/checkAuth";
import { AppointmentController } from "./appointment.controller";
import { Role } from "../../../generated/prisma/enums";
import { validateRequest } from "../../middleware/validateRequest";
import { AppointmentValidation } from "./appointment.validation";

const router = Router();

// ADMIN: all appointments (registered before the "/:id/..." routes)
router.get(
  "/",
  checkAuth(Role.ADMIN, Role.SUPER_ADMIN),
  AppointmentController.getAllAppointments,
);
router.post(
  "/book-appointment",
  bookingLimiter,
  checkAuth(Role.PATIENT),
  validateRequest(AppointmentValidation.bookAppointmentZodSchema),
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
  validateRequest(AppointmentValidation.changeAppointmentStatusZodSchema),
  AppointmentController.changeAppointmentStatus,
);
router.post(
  "/book-appointment-with-pay-later",
  bookingLimiter,
  checkAuth(Role.PATIENT),
  validateRequest(AppointmentValidation.bookAppointmentZodSchema),
  AppointmentController.bookAppointmentWithPayLater,
);
// DOCTOR: the patient's health data + reports through the doctor's own appointment (audited)
router.get(
  "/:id/medical-history",
  checkAuth(Role.DOCTOR),
  AppointmentController.getMedicalHistory,
);
router.get(
  "/:id/join",
  checkAuth(Role.PATIENT, Role.DOCTOR),
  AppointmentController.joinVideoCall,
);
router.patch(
  "/reschedule/:id",
  bookingLimiter,
  checkAuth(Role.PATIENT),
  validateRequest(AppointmentValidation.rescheduleAppointmentZodSchema),
  AppointmentController.rescheduleAppointment,
);
router.post(
  "/initiate-payment/:id",
  bookingLimiter,
  checkAuth(Role.PATIENT),
  AppointmentController.initiatePayment,
);

export const AppointmentRoutes = router;
