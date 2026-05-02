import { Request, Response } from "express";
import { catchAsync } from "../../shared/catchAsync";
import { StatsService } from "./stats.service";
import { sendResponse } from "../../shared/sendResponse";
import { StatusCodes } from "http-status-codes";

const getDashboardStatsData = catchAsync(
  async (req: Request, res: Response) => {
    const user = req.user;
    const result = await StatsService.getDashboardStatsData(user);
    sendResponse(res, {
      httpStatusCode: StatusCodes.OK,
      success: true,
      message: "Stats fetched successfully",
      data: result,
    });
  },
);
export const StatsController = {
  getDashboardStatsData,
};
