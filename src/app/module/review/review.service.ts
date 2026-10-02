import { StatusCodes } from "http-status-codes";
import {
  AppointmentStatus,
  PaymentStatus,
  Role,
} from "../../../generated/prisma/enums";
import AppError from "../../errorHelpers/AppError";
import { IRequestUser } from "../../interface/requestUser.interface";
import { prisma } from "../../lib/prisma";
import { ICreateReviewPayload, IUpdateReviewPayload } from "./review.interface";
import { getPatientProfileOrThrow } from "../../utils/profile";
import { QueryBuilder } from "../../utils/QueryBuilder";
import { IQueryParams } from "../../interface/query.interface";
import { Prisma, Review } from "../../../generated/prisma/client";

type TTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// average + count of VISIBLE reviews, written in the same transaction as every review
// change (create / update / delete / hide), so the two never disagree
const recomputeDoctorRating = async (tx: TTx, doctorId: string) => {
  const stats = await tx.review.aggregate({
    where: { doctorId, isHidden: false },
    _avg: { rating: true },
    _count: { _all: true },
  });
  await tx.doctor.update({
    where: { id: doctorId },
    // no reviews left -> average is null, store 0
    data: { averageRating: stats._avg.rating ?? 0, reviewCount: stats._count._all },
  });
};

const reviewListInclude = {
  patient: { select: { id: true, name: true, email: true, profilePhoto: true } },
  doctor: { select: { id: true, name: true, email: true, profilePhoto: true } },
} as const;

const createReview = async (
  user: IRequestUser,
  payload: ICreateReviewPayload,
) => {
  const patientData = await getPatientProfileOrThrow(user);
  const appointmentData = await prisma.appointment.findUniqueOrThrow({
    where: { id: payload.appointmentId },
  });
  if (appointmentData.patientId !== patientData.id) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "You can only review your own appointments",
    );
  }
  if (appointmentData.paymentStatus !== PaymentStatus.PAID) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Payment is not done");
  }
  // a review is about a consultation that actually happened
  if (appointmentData.status !== AppointmentStatus.COMPLETED) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "You can review an appointment only after it is completed",
    );
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
    await recomputeDoctorRating(tx, reviewData.doctorId);
    return reviewData;
  });
  return result;
};
// ADMIN: paginated, searchable list (incl. hidden reviews)
const getAllReview = async (query: IQueryParams) => {
  const queryBuilder = new QueryBuilder<Review, Prisma.ReviewWhereInput, Prisma.ReviewInclude>(prisma.review, query, {
    searchableFields: ["comment", "patient.name", "doctor.name"],
    filterableFields: ["isHidden", "rating", "doctorId", "patientId", "createdAt"],
  });
  return queryBuilder.search().filter().include(reviewListInclude).sort().paginate().fields().execute();
};

// ADMIN: hide an abusive review (or show it again); the doctor rating is recomputed
const setReviewVisibility = async (reviewId: string, payload: { isHidden: boolean; reason?: string }) => {
  return prisma.$transaction(async (tx) => {
    const review = await tx.review.findUnique({ where: { id: reviewId }, select: { id: true, doctorId: true } });
    if (!review) throw new AppError(StatusCodes.NOT_FOUND, "Review not found");
    const updated = await tx.review.update({
      where: { id: reviewId },
      data: payload.isHidden
        ? { isHidden: true, hiddenReason: payload.reason ?? null, hiddenAt: new Date() }
        : { isHidden: false, hiddenReason: null, hiddenAt: null },
      include: reviewListInclude,
    });
    await recomputeDoctorRating(tx, review.doctorId);
    return updated;
  });
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
      orderBy: { createdAt: "desc" },
      include: reviewListInclude,
    });
    return result;
  }
  if (isUserExists.role === Role.DOCTOR) {
    const doctorData = await prisma.doctor.findUniqueOrThrow({
      where: { userId: isUserExists.id },
      select: { id: true },
    });
    const result = await prisma.review.findMany({
      // hidden (moderated) reviews are not shown to the doctor either
      where: {
        doctorId: doctorData.id,
        isHidden: false,
      },
      orderBy: { createdAt: "desc" },
      include: reviewListInclude,
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
      StatusCodes.FORBIDDEN,
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
    await recomputeDoctorRating(tx, reviewData.doctorId);
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
      StatusCodes.FORBIDDEN,
      "You are not authorized to delete this review",
    );
  }
  const result = await prisma.$transaction(async (tx) => {
    const deleteData = await tx.review.delete({
      where: {
        id: reviewId,
      },
    });
    await recomputeDoctorRating(tx, deleteData.doctorId);
    return deleteData;
  });
  return result;
};
export const ReviewService = {
  createReview,
  getAllReview,
  setReviewVisibility,
  getMyReview,
  updateReview,
  deleteReview,
};
