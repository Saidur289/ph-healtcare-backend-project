import { NextFunction, Request, Response } from "express";
import z from "zod";
import { StatusCodes } from "http-status-codes";
import AppError from "../errorHelpers/AppError";

export const validateRequest = (zodSchema: z.ZodObject) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Express 5 leaves req.body undefined when there is no body
    let body: unknown = req.body ?? {};

    // multipart/form-data requests send the JSON payload as a string in "data"
    if (
      body &&
      typeof body === "object" &&
      typeof (body as Record<string, unknown>).data === "string"
    ) {
      try {
        body = JSON.parse((body as Record<string, string>).data);
      } catch {
        return next(
          new AppError(StatusCodes.BAD_REQUEST, "Invalid JSON in 'data' field"),
        );
      }
    }

    const parseResult = zodSchema.safeParse(body);
    if (!parseResult.success) {
      return next(parseResult.error);
    }

    req.body = parseResult.data;
    next();
  };
};
