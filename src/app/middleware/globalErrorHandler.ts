import { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { envVars } from "../config/env";

const globalErrorHandler = (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    err: any,
    req: Request,
    res: Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    next: NextFunction
) => {
    let statusCode = err.statusCode || StatusCodes.INTERNAL_SERVER_ERROR;
    let message = err.message || "Something went wrong";
    let errorDetails: any = err;

    // 🔹 Development Mode লগ
    if (envVars.NODE_ENV === "development") {
        console.error("💥 Error:", err);
    }

    // 🔹 Production Mode (clean response)
    if (envVars.NODE_ENV === "production") {
        if (!err.isOperational) {
            statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
            message = "Something went wrong!";
            errorDetails = null;
        }
    }

    res.status(statusCode).json({
        success: false,
        message,
        error: errorDetails,
    });
};

export default globalErrorHandler;