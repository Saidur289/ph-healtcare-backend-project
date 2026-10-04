import { StatusCodes } from "http-status-codes";
import { Role } from "../../../generated/prisma/enums";
import { PRIVATE_LINK_TTL_SECONDS, signedFileUrl } from "../../config/privateFiles";
import AppError from "../../errorHelpers/AppError";
import { IRequestUser } from "../../interface/requestUser.interface";
import { prisma } from "../../lib/prisma";
import { audit } from "../../utils/audit";

// One answer for "missing" and "not yours", so ids can't be probed.
const notFound = () => new AppError(StatusCodes.NOT_FOUND, "File not found");

const issueLink = async (user: IRequestUser, stored: string | null | undefined, entityType: string, entityId: string) => {
  const url = stored ? signedFileUrl(stored) : null;
  if (!url) throw notFound();
  await audit({ action: "file.read", actor: { userId: user.userId, role: user.role }, entityType, entityId });
  return { url, expiresInSeconds: PRIVATE_LINK_TTL_SECONDS };
};

// medical report: only the patient who uploaded it
const getReportLink = async (user: IRequestUser, reportId: string) => {
  if (user.role !== Role.PATIENT) throw notFound();
  const report = await prisma.medicalReport.findFirst({
    where: { id: reportId, patient: { userId: user.userId } },
    select: { id: true, reportLink: true },
  });
  if (!report) throw notFound();
  return issueLink(user, report.reportLink, "MedicalReport", report.id);
};

// prescription PDF: the patient it was written for, or the doctor who wrote it
const getPrescriptionLink = async (user: IRequestUser, prescriptionId: string) => {
  if (user.role !== Role.PATIENT && user.role !== Role.DOCTOR) throw notFound();
  const prescription = await prisma.prescription.findFirst({
    where: {
      id: prescriptionId,
      ...(user.role === Role.PATIENT ? { patient: { userId: user.userId } } : { doctor: { userId: user.userId } }),
    },
    select: { id: true, pdfUrl: true },
  });
  if (!prescription) throw notFound();
  return issueLink(user, prescription.pdfUrl, "Prescription", prescription.id);
};

// invoice: the patient who paid, or an admin (finance / support)
const getInvoiceLink = async (user: IRequestUser, paymentId: string) => {
  const isAdmin = user.role === Role.ADMIN || user.role === Role.SUPER_ADMIN;
  if (!isAdmin && user.role !== Role.PATIENT) throw notFound();
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, ...(isAdmin ? {} : { appointment: { patient: { userId: user.userId } } }) },
    select: { id: true, invoiceUrl: true },
  });
  if (!payment) throw notFound();
  return issueLink(user, payment.invoiceUrl, "Payment", payment.id);
};

export const FilesService = { getReportLink, getPrescriptionLink, getInvoiceLink };
