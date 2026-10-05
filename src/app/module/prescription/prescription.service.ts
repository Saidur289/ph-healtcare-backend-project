import { enqueueJob } from "../../utils/jobQueue";
import { StatusCodes } from "http-status-codes";
import { decryptJson, decryptText, encryptJson, encryptText } from "../../utils/fieldEncryption";
import { envVars } from "../../config/env";
import { uploadPrivateFile } from "../../config/privateFiles";
import AppError from "../../errorHelpers/AppError";
import { IRequestUser } from "../../interface/requestUser.interface";
import { prisma } from "../../lib/prisma";
import { generatePrescriptionPDF } from "./prescription.utils";
import {
  deleteFileFromCloudinary,
} from "../../config/cloudinary.config";
import { sendEmail } from "../../utils/email";
import {
  ICreatePrescriptionPayload,
  IUpdatePrescriptionPayload,
} from "./prescription.interface";
import { getDoctorProfileOrThrow, getPatientProfileOrThrow } from "../../utils/profile";
import { AppointmentStatus, Role } from "../../../generated/prisma/enums";
import { Prescription, Prisma } from "../../../generated/prisma/client";
import { QueryBuilder } from "../../utils/QueryBuilder";
import { IQueryParams } from "../../interface/query.interface";
import { TMedicine } from "./prescription.validation";

// PRESCRIPTION_DELIVERY=off skips PDF upload + email (tests / CI)
const isDeliveryEnabled = () => process.env.PRESCRIPTION_DELIVERY !== "off";

const prescriptionInclude = {
  patient: { select: { id: true, name: true, email: true } },
  doctor: { select: { id: true, name: true, email: true, designation: true } },
  appointment: { select: { id: true, status: true, schedule: true } },
} satisfies Prisma.PrescriptionInclude;

// instructions + medicines are encrypted in the DB; readers get plain values
const decryptPrescription = <T extends { instructions: string; medicines: unknown }>(row: T): T => ({
  ...row,
  instructions: decryptText(row.instructions),
  medicines: decryptJson(row.medicines),
});

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
  // stored encrypted (utils/fieldEncryption.ts)
  const medicines = decryptJson<TMedicine[]>(prescription.medicines);
  prescription.instructions = decryptText(prescription.instructions);
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
  // private file: the column holds a reference, readers get a short-lived link (privateFiles.ts)
  const storedRef = await uploadPrivateFile(pdfBuffer, "pdf", "prescriptions");
  const oldUrl = prescription.pdfUrl;
  await prisma.prescription.update({
    where: { id: prescription.id },
    data: { pdfUrl: storedRef },
  });
  if (oldUrl && oldUrl !== storedRef) {
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
      // the PDF is attached; the link opens the app (login required), never the file itself
      pdfUrl: `${envVars.FRONTEND_URL}/dashboard/my-prescriptions`,
    },
    attachments: [{ filename: fileName, content: pdfBuffer, contentType: "application/pdf" }],
  });
  await prisma.prescription.update({
    where: { id: prescription.id },
    data: { emailSentAt: new Date() },
  });
};

// PDF + upload + email run in the background job queue (utils/jobQueue.ts), with retries
const queueDelivery = (prescriptionId: string, reason: "new" | "updated") =>
  enqueueJob(
    "prescription.deliver",
    { prescriptionId, reason },
    reason === "new" ? { dedupeKey: `prescription:${prescriptionId}:new` } : {},
  );

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
  // queued once per prescription (rows from before the queue existed, or lost deliveries)
  for (const { id } of pending) await queueDelivery(id, "new");
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
        // medical content is encrypted at rest
        instructions: encryptText(payload.instructions),
        medicines: encryptJson(payload.medicines),
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
  await queueDelivery(prescription.id, "new");
  return decryptPrescription(prescription);
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
      ...(payload.instructions !== undefined ? { instructions: encryptText(payload.instructions) } : {}),
      ...(payload.followUpDate !== undefined ? { followUpDate: new Date(payload.followUpDate) } : {}),
      ...(payload.medicines !== undefined
        ? { medicines: encryptJson(payload.medicines) }
        : {}),
      emailSentAt: null, // the updated version must be sent again
    },
    include: prescriptionInclude,
  });
  await queueDelivery(updated.id, "updated");
  return decryptPrescription(updated);
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
    const rows = await prisma.prescription.findMany({
      where: { doctorId: doctorData.id },
      include: prescriptionInclude,
      orderBy: { createdAt: "desc" },
    });
    return rows.map(decryptPrescription);
  }
  const patientData = await getPatientProfileOrThrow(user);
  const rows = await prisma.prescription.findMany({
    where: { patientId: patientData.id },
    include: prescriptionInclude,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(decryptPrescription);
};

// ADMIN: paginated list with patient / doctor search (metadata only)
const getAllPrescriptions = async (query: IQueryParams) => {
  const queryBuilder = new QueryBuilder<Prescription, Prisma.PrescriptionWhereInput, Prisma.PrescriptionInclude>(
    prisma.prescription,
    query,
    {
      searchableFields: ["patient.name", "patient.email", "doctor.name"],
      filterableFields: ["doctorId", "patientId", "createdAt", "followUpDate"],
    },
  );
  // no medicines, instructions or PDF link: admins see who prescribed when, not the medical content
  return queryBuilder
    .search()
    .filter()
    .select({
      id: true,
      createdAt: true,
      followUpDate: true,
      emailSentAt: true,
      patient: { select: { id: true, name: true, email: true } },
      doctor: { select: { id: true, name: true, designation: true } },
      appointment: { select: { id: true, status: true } },
    })
    .sort()
    .paginate()
    .execute();
};

export const PrescriptionService = {
  givePrescription,
  myPrescriptions,
  getAllPrescriptions,
  updatePrescription,
  deletePrescription,
  retryPrescriptionDelivery,
  deliverPrescription,
};
