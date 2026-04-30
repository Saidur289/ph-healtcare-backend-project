/* eslint-disable @typescript-eslint/no-explicit-any */
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

const givePrescription = async (
  user: IRequestUser,
  payload: ICreatePrescriptionPayload,
) => {
  console.log("Function started");

  // Find logged-in doctor
  const doctorData = await prisma.doctor.findFirstOrThrow({
    where: {
      email: user.email,
    },
  });

  console.log("Doctor Found:", doctorData);

  // Find appointment with relations
  const appointmentData = await prisma.appointment.findFirstOrThrow({
    where: {
      id: payload.appointmentId,
    },
    include: {
      patient: true,
      doctor: {
        include: {
          specialties: {
            include: {
              specialty: true,
            },
          },
        },
      },
      schedule: {
        include: {
          doctorSchedules: true,
        },
      },
    },
  });

  console.log("Appointment Found:", appointmentData);

  // Authorization check
  if (appointmentData.doctorId !== doctorData.id) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "You are not authorized to give prescription",
    );
  }

  console.log("Authorization Passed");

  // Check duplicate prescription
  const isAlreadyPrescribed = await prisma.prescription.findFirst({
    where: {
      appointmentId: payload.appointmentId,
    },
  });

  if (isAlreadyPrescribed) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Prescription already exists");
  }

  console.log("No previous prescription found");

  const followUpDate = new Date(payload.followUpDate);

  // Start transaction
  const result = await prisma.$transaction(
    async (tx) => {
      console.log("Transaction Started");

      // Create prescription
      const prescription = await tx.prescription.create({
        data: {
          ...payload,
          followUpDate,
          doctorId: doctorData.id,
          patientId: appointmentData.patientId,
        },
      });

      console.log("Prescription Created:", prescription);

      // Generate PDF
      const pdfBuffer = await generatePrescriptionPDF({
        doctorName: appointmentData.doctor.name,
        doctorEmail: appointmentData.doctor.email,
        patientName: appointmentData.patient.name,
        patientEmail: appointmentData.patient.email,
        followUpDate,
        instructions: payload.instructions,
        prescriptionId: prescription.id,
        appointmentDate: appointmentData.schedule.startDateTime,
        createdAt: new Date(),
      });

      console.log("PDF Generated");

      // Upload PDF
      const fileName = `Prescription_${Date.now()}.pdf`;

      const uploadedFile = await uploadFileToCloudinary(pdfBuffer, fileName);

      console.log("PDF Uploaded:", uploadedFile.secure_url);

      // Update prescription with pdf URL
      const updatedPrescription = await tx.prescription.update({
        where: {
          id: prescription.id,
        },
        data: {
          pdfUrl: uploadedFile.secure_url,
        },
      });

      console.log("Prescription Updated with PDF URL");

      // Send Email
      try {
        const patient = appointmentData.patient;
        const doctor = appointmentData.doctor;

        await sendEmail({
          to: patient.email,
          subject: `You have received a new prescription from Dr. ${doctor.name}`,
          templateName: "prescription",
          templateData: {
            doctorName: doctor.name,
            patientName: patient.name,
            specialization: doctor.specialties
              .map((s: any) => s.title)
              .join(", "),
            appointmentDate: new Date(
              appointmentData.schedule.startDateTime,
            ).toLocaleString(),
            issuedDate: new Date().toLocaleDateString(),
            prescriptionId: result.id,
            instructions: payload.instructions,
            followUpDate: followUpDate.toLocaleDateString(),
            pdfUrl: uploadedFile.secure_url,
          },
          attachments: [
            {
              filename: fileName,
              content: pdfBuffer,
              contentType: "application/pdf",
            },
          ],
        });
      } catch (error) {
        console.log(
          "Failed To send email notification for prescription",
          error,
        );
      }

      return updatedPrescription;
    },
    {
      maxWait: 15000,
      timeout: 20000,
    },
  );

  console.log("Function Completed");

  return result;
};
const myPrescriptions = async (user: IRequestUser) => {
  const userExists = await prisma.user.findUniqueOrThrow({
    where: {
      email: user.email,
    },
  });
  if (!userExists) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found");
  }
  if (userExists.role === "DOCTOR") {
    const prescriptions = await prisma.prescription.findMany({
      where: {
        doctorId: userExists.id,
      },
      include: {
        patient: true,
        doctor: true,
        appointment: {
          include: {
            schedule: true,
          },
        },
      },
    });
    return prescriptions;
  }
  if (userExists.role === "PATIENT") {
    const prescriptions = await prisma.prescription.findMany({
      where: { patientId: userExists.id },
      include: {
        patient: true,
        doctor: true,
        appointment: {
          include: {
            schedule: true,
          },
        },
      },
    });
    return prescriptions;
  }
};
const getAllPrescriptions = async () => {
  const prescriptions = await prisma.prescription.findMany({
    include: {
      patient: true,
      doctor: true,
      appointment: true,
    },
  });
  return prescriptions;
};
const updatePrescription = async (
  user: IRequestUser,
  prescriptionId: string,
  payload: IUpdatePrescriptionPayload,
) => {
  const userExists = await prisma.user.findUnique({
    where: {
      email: user.email,
    },
  });
  if (!userExists) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found");
  }
  const prescriptionData = await prisma.prescription.findUniqueOrThrow({
    where: {
      id: prescriptionId,
    },
    include: {
      doctor: true,
      patient: true,
      appointment: {
        include: {
          schedule: true,
        },
      },
    },
  });
  if (prescriptionData.doctor.email !== user.email) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "You are not authorized to update this prescription",
    );
  }
  // Update prescription
  const updatedInstructions =
    payload.instructions ?? prescriptionData.instructions;
  const updatedFollowUpDate = payload.followUpDate
    ? new Date(payload.followUpDate)
    : prescriptionData.followUpDate;
  // upload new PDF
  const pdfBuffer = await generatePrescriptionPDF({
    doctorName: prescriptionData.doctor.name,
    doctorEmail: prescriptionData.doctor.email,
    patientName: prescriptionData.patient.name,
    patientEmail: prescriptionData.patient.email,
    followUpDate: updatedFollowUpDate,
    instructions: updatedInstructions,
    prescriptionId: prescriptionData.id,
    appointmentDate: prescriptionData.appointment.schedule.startDateTime,
    createdAt: prescriptionData.createdAt,
  });
  //save PDF to cloudinary
  const filename = `Prescription_updated${Date.now()}.pdf`;
  const uploadedFile = await uploadFileToCloudinary(pdfBuffer, filename);
  const updatedUrl = uploadedFile.secure_url;
  // delete old PDF from cloudinary
  if (prescriptionData.pdfUrl) {
    try {
      await deleteFileFromCloudinary(prescriptionData.pdfUrl);
    } catch (error) {
      console.error("Error occurred while deleting old PDF file:", error);
    }
  }
  const updatedPrescription = await prisma.prescription.update({
    where: {
      id: prescriptionId,
    },
    data: {
      instructions: updatedInstructions,
      followUpDate: updatedFollowUpDate,
      pdfUrl: updatedUrl,
    },
    include: {
      patient: true,
      doctor: true,
      appointment: {
        include: {
          schedule: true,
        },
      },
    },
  });
  // send email notification to patient about prescription update
  try {
    await sendEmail({
      to: prescriptionData.patient.email,
      subject: `Your prescription from Dr. ${prescriptionData.doctor.name} has been updated`,
      templateName: "prescription_update",
      templateData: {
        doctorName: prescriptionData.doctor.name,
        patientName: prescriptionData.patient.name,
        specialization: "Healthcare Service",
        followUpDate: updatedFollowUpDate.toLocaleDateString(),
        instructions: updatedInstructions,
        appointmentDate: new Date(
          prescriptionData.appointment.schedule.startDateTime,
        ).toLocaleString(),
        issuedDate: new Date().toLocaleDateString(),
        prescriptionId: prescriptionData.id,
        pdfUrl: updatedUrl,
      },
      attachments: [
        {
          filename: filename,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });
  } catch (error) {
    console.log(
      "Failed to send email notification for prescription update",
      error,
    );
  }
  return updatedPrescription;
};
const deletePrescription = async (
  user: IRequestUser,
  prescriptionId: string,
): Promise<void> => {
  const userExists = await prisma.user.findUnique({
    where: {
      email: user.email,
    },
  });
  if (!userExists) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found");
  }
  const prescriptionData = await prisma.prescription.findUniqueOrThrow({
    where: {
      id: prescriptionId,
    },
    include: {
      doctor: true,
      patient: true,
      appointment: {
        include: {
          schedule: true,
        },
      },
    },
  });
  if (prescriptionData.doctor.email !== user.email) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "You are not authorized to delete this prescription",
    );
  }
  // delete PDF from cloudinary
  if (prescriptionData.pdfUrl) {
    try {
      await deleteFileFromCloudinary(prescriptionData.pdfUrl);
    } catch (error) {
      console.error("Error occurred while deleting PDF file:", error);
    }
  }
  await prisma.prescription.delete({
    where: {
      id: prescriptionId,
    },
  });
};

export const PrescriptionService = {
  givePrescription,
  myPrescriptions,
  getAllPrescriptions,
  updatePrescription,
  deletePrescription,
};
