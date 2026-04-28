/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { envVars } from "../config/env";
import { TErrorResponse, TErrorSources } from "../interface/error.interface";
import z from "zod";
import { handleZodError } from "../errorHelpers/HandleZodError";

import AppError from "../errorHelpers/AppError";

import { deleteUploadedFilesFromGlobalErrorHandler } from "../utils/deletedUploadedFilesFromGlobalErrorHandler";

const globalErrorHandler = async (
  err: any,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction,
) => {
  if (envVars.NODE_ENV === "development") {
    console.error("Error: ", err);
  }
  let errorSources: TErrorSources[] = [];
  let statusCode: number = StatusCodes.INTERNAL_SERVER_ERROR;
  let message: string = "internal server error";
  let stack: string | undefined = undefined;
  //delete file from cloudinary for each file when error happen in prisma and not save in database
  // if (req.file) {
  //   await deleteFileFromCloudinary(req.file.path);
  // }
  // // delete multiple file from cloudinary
  // if (req.files && Array.isArray(req.files) && req.files.length > 0) {
  //   const imageUrls = req.files.map((file: any) => file.path);
  //   await Promise.all(
  //     imageUrls.map((imageUrl: string) => deleteFileFromCloudinary(imageUrl)),
  //   );
  // }
  // // delete file from cloudinary for each file when error happen in express
  await deleteUploadedFilesFromGlobalErrorHandler(req);
  if (err instanceof z.ZodError) {
    const simplifiedError = handleZodError(err);
    message = simplifiedError.message;
    errorSources = [...simplifiedError.errorSources!];
    statusCode = simplifiedError.statusCode! as number;
    stack = err.stack;
  } else if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    stack = err.stack;
    errorSources = [
      {
        path: "",
        message: err.message,
      },
    ];
  } else if (err instanceof Error) {
    statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
    message = err.message;
    stack = err.stack;
    errorSources = [
      {
        path: "",
        message: err.message,
      },
    ];
  }
  const errorResponse: TErrorResponse = {
    success: false,
    message: message,
    errorSources,
    stack: envVars.NODE_ENV === "development" ? stack : undefined,
    error: envVars.NODE_ENV === "development" ? err : undefined,
  };

  res.status(statusCode).json(errorResponse);
};

export default globalErrorHandler;
