import { StatusCodes } from "http-status-codes";
import AppError from "../../errorHelpers/AppError";
import { IRequestUser } from "../../interface/requestUser.interface";
import { prisma } from "../../lib/prisma";
import { generatePrescriptionPDF } from "./prescription.utils";
import {
  deleteFileFromCloudinary,
  uploadFileToCloudinary,
} from "../../config/cloudinary.config";
import { sendEmail } from "../../utils/email";
import {
  ICreatePrescriptionPayload,
  IUpdatePrescriptionPayload,
} from "./prescription.interface";
import { getDoctorProfileOrThrow, getPatientProfileOrThrow } from "../../utils/profile";
import { AppointmentStatus, Role } from "../../../generated/prisma/enums";
import { Prisma } from "../../../generated/prisma/client";
import { TMedicine } from "./prescription.validation";

// PRESCRIPTION_DELIVERY=off skips PDF upload + email (tests / CI)
const isDeliveryEnabled = () => process.env.PRESCRIPTION_DELIVERY !== "off";

const prescriptionInclude = {
  patient: { select: { id: true, name: true, email: true } },
  doctor: { select: { id: true, name: true, email: true, designation: true } },
  appointment: { select: { id: true, status: true, schedule: true } },
} satisfies Prisma.PrescriptionInclude;

// ------------------------------------------------------------------ delivery (PDF + email)

// Builds the PDF, replaces the stored one and emails it. Runs AFTER the prescription is saved;
// any failure is logged and retried by retryPrescriptionDelivery(), never undoing the save.
const deliverPrescription = async (prescriptionId: string, reason: "new" | "updated") => {
  if (!isDeliveryEnabled()) return;
  const prescription = await prisma.prescription.findUniqueOrThrow({
    where: { id: prescriptionId },
    include: {
      patient: true,
      doctor: { include: { specialties: { include: { specialty: true } } } },
      appointment: { include: { schedule: true } },
    },
  });
  const medicines = prescription.medicines as unknown as TMedicine[];
  const pdfBuffer = await generatePrescriptionPDF({
    doctorName: prescription.doctor.name,
    doctorEmail: prescription.doctor.email,
    patientName: prescription.patient.name,
    patientEmail: prescription.patient.email,
    followUpDate: prescription.followUpDate,
    instructions: prescription.instructions,
    medicines,
    prescriptionId: prescription.id,
    appointmentDate: prescription.appointment.schedule.startDateTime,
    createdAt: prescription.createdAt,
  });
  const fileName = `Prescription_${prescription.id}_${Date.now()}.pdf`;
  const uploaded = await uploadFileToCloudinary(pdfBuffer, fileName);
  const oldUrl = prescription.pdfUrl;
  await prisma.prescription.update({
    where: { id: prescription.id },
    data: { pdfUrl: uploaded.secure_url },
  });
  if (oldUrl && oldUrl !== uploaded.secure_url) {
    await deleteFileFromCloudinary(oldUrl).catch(() => undefined);
  }

  await sendEmail({
    to: prescription.patient.email,
    subject:
      reason === "new"
        ? `You have received a new prescription from Dr. ${prescription.doctor.name}`
        : `Your prescription from Dr. ${prescription.doctor.name} has been updated`,
    templateName: "prescription",
    templateData: {
      doctorName: prescription.doctor.name,
      patientName: prescription.patient.name,
      specialization:
        prescription.doctor.specialties.map((s) => s.specialty.title).join(", ") || "Healthcare Service",
      appointmentDate: prescription.appointment.schedule.startDateTime.toLocaleString(),
      issuedDate: new Date().toLocaleDateString(),
      prescriptionId: prescription.id,
      instructions: prescription.instructions,
      medicines,
      followUpDate: prescription.followUpDate.toLocaleDateString(),
      pdfUrl: uploaded.secure_url,
    },
    attachments: [{ filename: fileName, content: pdfBuffer, contentType: "application/pdf" }],
  });
  await prisma.prescription.update({
    where: { id: prescription.id },
    data: { emailSentAt: new Date() },
  });
};

const queueDelivery = (prescriptionId: string, reason: "new" | "updated") => {
  setImmediate(() => {
    deliverPrescription(prescriptionId, reason).catch((error) =>
      console.error(`[prescription] delivery of ${prescriptionId} failed:`, error?.message),
    );
  });
};

// cron: prescriptions whose PDF or email didn't go out within 10 minutes
const retryPrescriptionDelivery = async () => {
  if (!isDeliveryEnabled()) return 0;
  const pending = await prisma.prescription.findMany({
    where: {
      OR: [{ pdfUrl: null }, { emailSentAt: null }],
      updatedAt: { lt: new Date(Date.now() - 10 * 60 * 1000) },
    },
    select: { id: true },
    take: 20,
  });
  for (const { id } of pending) {
    await deliverPrescription(id, "new").catch((error) =>
      console.error(`[prescription] retry for ${id} failed:`, error?.message),
    );
  }
  return pending.length;
};

// ------------------------------------------------------------------ doctor actions

// Only the appointment's own doctor, only once the consultation started (INPROGRESS) or
// finished (COMPLETED), and only one prescription per appointment.
const givePrescription = async (user: IRequestUser, payload: ICreatePrescriptionPayload) => {
  const doctorData = await getDoctorProfileOrThrow(user);
  const appointment = await prisma.appointment.findUnique({
    where: { id: payload.appointmentId },
    select: { id: true, doctorId: true, patientId: true, status: true },
  });
  if (!appointment || appointment.doctorId !== doctorData.id) {
    throw new AppError(StatusCodes.FORBIDDEN, "You can only write prescriptions for your own appointments");
  }
  if (
    appointment.status !== AppointmentStatus.INPROGRESS &&
    appointment.status !== AppointmentStatus.COMPLETED
  ) {
    throw new AppError(
      StatusCodes.CONFLICT,
      "A prescription can be written once the consultation has started or finished",
    );
  }

  let prescription;
  try {
    prescription = await prisma.prescription.create({
      data: {
        appointmentId: appointment.id,
        followUpDate: new Date(payload.followUpDate),
        instructions: payload.instructions,
        medicines: payload.medicines as unknown as Prisma.InputJsonValue,
        doctorId: doctorData.id,
        patientId: appointment.patientId,
      },
      include: prescriptionInclude,
    });
  } catch (error) {
    // appointmentId is unique: a second prescription for the same appointment
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError(StatusCodes.CONFLICT, "This appointment already has a prescription. Edit it instead.");
    }
    throw error;
  }
  queueDelivery(prescription.id, "new");
  return prescription;
};

const updatePrescription = async (
  user: IRequestUser,
  prescriptionId: string,
  payload: IUpdatePrescriptionPayload,
) => {
  const doctorData = await getDoctorProfileOrThrow(user);
  const existing = await prisma.prescription.findUnique({ where: { id: prescriptionId } });
  if (!existing || existing.doctorId !== doctorData.id) {
    throw new AppError(StatusCodes.NOT_FOUND, "Prescription not found");
  }
  const updated = await prisma.prescription.update({
    where: { id: prescriptionId },
    data: {
      ...(payload.instructions !== undefined ? { instructions: payload.instructions } : {}),
      ...(payload.followUpDate !== undefined ? { followUpDate: new Date(payload.followUpDate) } : {}),
      ...(payload.medicines !== undefined
        ? { medicines: payload.medicines as unknown as Prisma.InputJsonValue }
        : {}),
      emailSentAt: null, // the updated version must be sent again
    },
    include: prescriptionInclude,
  });
  queueDelivery(updated.id, "updated");
  return updated;
};

const deletePrescription = async (user: IRequestUser, prescriptionId: string): Promise<void> => {
  const doctorData = await getDoctorProfileOrThrow(user);
  const existing = await prisma.prescription.findUnique({ where: { id: prescriptionId } });
  if (!existing || existing.doctorId !== doctorData.id) {
    throw new AppError(StatusCodes.NOT_FOUND, "Prescription not found");
  }
  await prisma.prescription.delete({ where: { id: prescriptionId } });
  if (existing.pdfUrl) {
    await deleteFileFromCloudinary(existing.pdfUrl).catch((error) =>
      console.error("Error deleting prescription PDF:", error?.message),
    );
  }
};

// ------------------------------------------------------------------ reading

const myPrescriptions = async (user: IRequestUser) => {
  if (user.role === Role.DOCTOR) {
    const doctorData = await getDoctorProfileOrThrow(user);
    return prisma.prescription.findMany({
      where: { doctorId: doctorData.id },
      include: prescriptionInclude,
      orderBy: { createdAt: "desc" },
    });
  }
  const patientData = await getPatientProfileOrThrow(user);
  return prisma.prescription.findMany({
    where: { patientId: patientData.id },
    include: prescriptionInclude,
    orderBy: { createdAt: "desc" },
  });
};

const getAllPrescriptions = async () =>
  prisma.prescription.findMany({
    include: prescriptionInclude,
    orderBy: { createdAt: "desc" },
    take: 200,
  });

export const PrescriptionService = {
  givePrescription,
  myPrescriptions,
  getAllPrescriptions,
  updatePrescription,
  deletePrescription,
  retryPrescriptionDelivery,
};
