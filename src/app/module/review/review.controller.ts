import { Request, Response } from "express";
import { catchAsync } from "../../shared/catchAsync";
import { ReviewService } from "./review.service";
import { sendResponse } from "../../shared/sendResponse";
import { IQueryParams } from "../../interface/query.interface";

const createReview = catchAsync(async (req: Request, res: Response) => {
  const payload = req.body;
  const user = req.user;
  const result = await ReviewService.createReview(user, payload);
  sendResponse(res, {
    httpStatusCode: 201,
    success: true,
    message: "Review created successfully",
    data: result,
  });
});
const getAllReview = catchAsync(async (req: Request, res: Response) => {
  const result = await ReviewService.getAllReview(req.query as IQueryParams);
  sendResponse(res, {
    httpStatusCode: 200,
    success: true,
    message: "Review fetched successfully",
    data: result.data,
    meta: result.meta,
  });
});
const getMyReview = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  const result = await ReviewService.getMyReview(user);
  sendResponse(res, {
    httpStatusCode: 200,
    success: true,
    message: "Review fetched successfully",
    data: result,
  });
});
const updateReview = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  const payload = req.body;
  const reviewId = req.params.id;
  const result = await ReviewService.updateReview(
    user,
    reviewId as string,
    payload,
  );
  sendResponse(res, {
    httpStatusCode: 200,
    success: true,
    message: "Review updated successfully",
    data: result,
  });
});
const deleteReview = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  const reviewId = req.params.id;
  const result = await ReviewService.deleteReview(user, reviewId as string);
  sendResponse(res, {
    httpStatusCode: 200,
    success: true,
    message: "Review deleted successfully",
    data: result,
  });
});
const setReviewVisibility = catchAsync(async (req: Request, res: Response) => {
  const result = await ReviewService.setReviewVisibility(req.params.id as string, req.body);
  sendResponse(res, {
    httpStatusCode: 200,
    success: true,
    message: result.isHidden ? "Review hidden" : "Review is visible again",
    data: result,
  });
});
export const ReviewController = {
  setReviewVisibility,
  createReview,
  getAllReview,
  getMyReview,
  updateReview,
  deleteReview,
};
