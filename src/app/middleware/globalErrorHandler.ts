import { reportError } from "../lib/errorTracking";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextFunction, Request, Response } from "express";
import multer from "multer";
import { StatusCodes } from "http-status-codes";
import { envVars } from "../config/env";
import { TErrorResponse, TErrorSources } from "../interface/error.interface";
import z from "zod";
import { handleZodError } from "../errorHelpers/HandleZodError";

import AppError from "../errorHelpers/AppError";
import { APIError } from "better-auth/api";

import { deleteUploadedFilesFromGlobalErrorHandler } from "../utils/deletedUploadedFilesFromGlobalErrorHandler";
import { Prisma } from "../../generated/prisma/client";
import { logger } from "../lib/logger";
import {
  handlePrismaClientInitializationError,
  handlePrismaClientKnownRequestError,
  handlePrismaClientRustPanicError,
  handlePrismaClientUnknownRequestError,
  handlePrismaClientValidationError,
} from "../errorHelpers/handlePrismaError";

const globalErrorHandler = async (
  err: any,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction,
) => {
  let errorSources: TErrorSources[] = [];
  let statusCode: number = StatusCodes.INTERNAL_SERVER_ERROR;
  let message: string = "internal server error";
  let stack: string | undefined = undefined;
  await deleteUploadedFilesFromGlobalErrorHandler(req);
  if (err instanceof z.ZodError) {
    const simplifiedError = handleZodError(err);
    message = simplifiedError.message;
    errorSources = [...simplifiedError.errorSources!];
    statusCode = simplifiedError.statusCode! as number;
    stack = err.stack;
  } else if (err instanceof Prisma.PrismaClientInitializationError) {
    const obj = handlePrismaClientInitializationError(err);
    message = obj.message;
    errorSources = [...obj.errorSources!];
    statusCode = obj.statusCode! as number;
    stack = obj.stack;
  } else if (err instanceof Prisma.PrismaClientUnknownRequestError) {
    const obj = handlePrismaClientUnknownRequestError(err);
    message = obj.message;
    errorSources = [...obj.errorSources!];
    statusCode = obj.statusCode! as number;
    stack = err.stack;
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const obj = handlePrismaClientKnownRequestError(err);
    message = obj.message;
    errorSources = [...obj.errorSources!];
    statusCode = obj.statusCode! as number;
    stack = obj.stack;
  } else if (err instanceof Prisma.PrismaClientRustPanicError) {
    const obj = handlePrismaClientRustPanicError();
    message = obj.message;
    errorSources = [...obj.errorSources!];
    statusCode = obj.statusCode! as number;
    stack = obj.stack;
  } else if (err instanceof Prisma.PrismaClientValidationError) {
    const obj = handlePrismaClientValidationError(err);
    message = obj.message;
    errorSources = [...obj.errorSources!];
    statusCode = obj.statusCode! as number;
    stack = obj.stack;
  } else if (err instanceof APIError) {
    // better-auth errors (wrong OTP, wrong current password, ...) carry their own 4xx status
    statusCode = err.statusCode || StatusCodes.BAD_REQUEST;
    message = err.body?.message || err.message || "Authentication error";
    stack = err.stack;
    errorSources = [{ path: err.body?.code ?? "", message }];
  } else if (err?.type === "entity.too.large" || err?.type === "entity.parse.failed") {
    // express.json(): body over 100 kb, or not valid JSON
    statusCode = err.type === "entity.too.large" ? StatusCodes.REQUEST_TOO_LONG : StatusCodes.BAD_REQUEST;
    message = err.type === "entity.too.large" ? "The request is too large" : "The request body is not valid JSON";
    stack = err.stack;
    errorSources = [{ path: "body", message }];
  } else if (err instanceof multer.MulterError) {
    // upload limits from config/multer.config.ts
    statusCode = err.code === "LIMIT_FILE_SIZE" ? StatusCodes.REQUEST_TOO_LONG : StatusCodes.BAD_REQUEST;
    message =
      err.code === "LIMIT_FILE_SIZE"
        ? "Each file must be 5 MB or smaller"
        : err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE"
          ? "Too many files, or an unexpected file field"
          : "The upload could not be processed";
    stack = err.stack;
    errorSources = [{ path: err.field ?? "", message }];
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
    // unexpected errors can contain internal details; only show them in development
    message =
      envVars.NODE_ENV === "development" ? err.message : "Something went wrong";
    stack = err.stack;
    errorSources = [
      {
        path: "",
        message,
      },
    ];
  }
  // 5xx: log the full error with the request id (pino redacts secrets / personal fields).
  // 4xx are expected (validation, auth, not found); the request logger already records them.
  if (statusCode >= 500) {
    ((req as Request & { log?: typeof logger }).log ?? logger).error({ err, statusCode }, "request failed");
    reportError(err, { statusCode, method: req.method, path: req.path });
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
