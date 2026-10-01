import { StatusCodes } from "http-status-codes";
import { PaymentStatus, Role } from "../../../generated/prisma/enums";
import AppError from "../../errorHelpers/AppError";
import { IRequestUser } from "../../interface/requestUser.interface";
import { prisma } from "../../lib/prisma";
import { ICreateReviewPayload, IUpdateReviewPayload } from "./review.interface";

const createReview = async (
  user: IRequestUser,
  payload: ICreateReviewPayload,
) => {
  const patientData = await prisma.patient.findUniqueOrThrow({
    where: { email: user.email },
  });
  const appointmentData = await prisma.appointment.findUniqueOrThrow({
    where: { id: payload.appointmentId },
  });
  if (appointmentData.patientId !== patientData.id) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "You are not authorized to give review",
    );
  }
  if (appointmentData.paymentStatus !== PaymentStatus.PAID) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Payment is not done");
  }
  const isReviewed = await prisma.review.findFirst({
    where: {
      appointmentId: payload.appointmentId,
    },
  });
  if (isReviewed) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "You have already reviewed this appointment",
    );
  }
  const result = await prisma.$transaction(async (tx) => {
    const reviewData = await tx.review.create({
      data: {
        patientId: patientData.id,
        doctorId: appointmentData.doctorId,
        appointmentId: appointmentData.id,
        rating: payload.rating,
        comment: payload.comment,
      },
    });
    const averageRating = await tx.review.aggregate({
      where: {
        doctorId: reviewData.doctorId,
      },
      _avg: {
        rating: true,
      },
    });
    await tx.doctor.update({
      where: {
        id: reviewData.doctorId,
      },
      data: {
        // no reviews left -> average is null, store 0
        averageRating: averageRating._avg.rating ?? 0,
      },
    });
    return reviewData;
  });
  return result;
};
const getAllReview = async () => {
  const result = await prisma.review.findMany({
    include: {
      patient: true,
      doctor: true,
    },
  });
  return result;
};
const getMyReview = async (user: IRequestUser) => {
  const isUserExists = await prisma.user.findUnique({
    where: {
      email: user.email,
    },
  });
  if (!isUserExists) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found");
  }
  // reviews store the Patient / Doctor profile id, not the User id
  if (isUserExists.role === Role.PATIENT) {
    const patientData = await prisma.patient.findUniqueOrThrow({
      where: { userId: isUserExists.id },
      select: { id: true },
    });
    const result = await prisma.review.findMany({
      where: {
        patientId: patientData.id,
      },
      include: {
        patient: true,
        doctor: true,
      },
    });
    return result;
  }
  if (isUserExists.role === Role.DOCTOR) {
    const doctorData = await prisma.doctor.findUniqueOrThrow({
      where: { userId: isUserExists.id },
      select: { id: true },
    });
    const result = await prisma.review.findMany({
      where: {
        doctorId: doctorData.id,
      },
      include: {
        patient: true,
        doctor: true,
      },
    });
    return result;
  }
};
const updateReview = async (
  user: IRequestUser,
  reviewId: string,
  payload: IUpdateReviewPayload,
) => {
  const patientData = await prisma.patient.findUnique({
    where: {
      email: user.email,
    },
  });
  if (!patientData) {
    throw new AppError(StatusCodes.NOT_FOUND, "Patient not found");
  }
  const isReviewed = await prisma.review.findUnique({
    where: {
      id: reviewId,
    },
  });
  if (!isReviewed) {
    throw new AppError(StatusCodes.NOT_FOUND, "Review not found");
  }
  if (isReviewed.patientId !== patientData.id) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "You are not authorized to update this review",
    );
  }
  const result = await prisma.$transaction(async (tx) => {
    const reviewData = await tx.review.update({
      where: {
        id: reviewId,
      },
      data: {
        rating: payload.rating,
        comment: payload.comment,
      },
    });
    const averageRating = await tx.review.aggregate({
      where: {
        doctorId: reviewData.doctorId,
      },
      _avg: {
        rating: true,
      },
    });
    await tx.doctor.update({
      where: {
        id: reviewData.doctorId,
      },
      data: {
        // no reviews left -> average is null, store 0
        averageRating: averageRating._avg.rating ?? 0,
      },
    });
    return reviewData;
  });
  return result;
};
const deleteReview = async (user: IRequestUser, reviewId: string) => {
  const patientData = await prisma.patient.findUnique({
    where: {
      email: user.email,
    },
  });
  if (!patientData) {
    throw new AppError(StatusCodes.NOT_FOUND, "Patient not found");
  }
  const isReviewed = await prisma.review.findUnique({
    where: {
      id: reviewId,
    },
  });
  if (!isReviewed) {
    throw new AppError(StatusCodes.NOT_FOUND, "Review not found");
  }
  if (isReviewed.patientId !== patientData.id) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "You are not authorized to delete this review",
    );
  }
  const result = await prisma.$transaction(async (tx) => {
    const deleteData = await tx.review.delete({
      where: {
        id: reviewId,
      },
    });
    const averageRating = await tx.review.aggregate({
      where: {
        doctorId: deleteData.doctorId,
      },
      _avg: {
        rating: true,
      },
    });
    await tx.doctor.update({
      where: {
        id: deleteData.doctorId,
      },
      data: {
        // no reviews left -> average is null, store 0
        averageRating: averageRating._avg.rating ?? 0,
      },
    });
    return deleteData;
  });
  return result;
};
export const ReviewService = {
  createReview,
  getAllReview,
  getMyReview,
  updateReview,
  deleteReview,
};
