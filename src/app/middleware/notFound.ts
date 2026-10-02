import { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const notFound = (req: Request, res: Response, next: NextFunction) => {
  res.status(StatusCodes.NOT_FOUND).json({
    success: false,
    // the URL is not echoed back (it is user input)
    message: "Route not found",
    errorSources: [{ path: req.path.slice(0, 200), message: "Route not found" }],
  });
};
