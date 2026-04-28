import { Request, Response } from "express";
import { catchAsync } from "../../shared/catchAsync";
import { ReviewService } from "./review.service";
import { sendResponse } from "../../shared/sendResponse";

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
  const result = await ReviewService.getAllReview();
  sendResponse(res, {
    httpStatusCode: 200,
    success: true,
    message: "Review fetched successfully",
    data: result,
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
export const ReviewController = {
  createReview,
  getAllReview,
  getMyReview,
  updateReview,
  deleteReview,
};
