import { Router } from "express";
import { SpecialtyRoutes } from "../module/specialty/specialty.route";
import { AuthRoutes } from "../module/auth/auth.route";
import { UserRoutes } from "../module/user/user.route";
import { DoctorRoutes } from "../module/doctor/doctor.route";
import { AdminRoutes } from "../module/admin/admin.route";
import { ScheduleRoutes } from "../module/schedule/schedule.route";
import { AppointmentRoutes } from "../module/appointment/appointment.route";
import { DoctorScheduleRoutes } from "../module/doctorSchedule/doctorSchedule.route";
import { PatientRoutes } from "../module/patient/patient.route";
import { ReviewRoutes } from "../module/review/review.route";
import { PrescriptionRoutes } from "../module/prescription/prescription.route";

const router = Router();
router.use("/specialties", SpecialtyRoutes);
router.use("/auth", AuthRoutes);
router.use("/user", UserRoutes);
router.use("/doctors", DoctorRoutes);
router.use("/admins", AdminRoutes);
router.use("/schedules", ScheduleRoutes);
router.use("/appointments", AppointmentRoutes);
router.use("/doctor-schedules", DoctorScheduleRoutes);
router.use("/patients", PatientRoutes);
router.use("/reviews", ReviewRoutes);
router.use("/prescriptions", PrescriptionRoutes);

export const IndexRoutes = router;
