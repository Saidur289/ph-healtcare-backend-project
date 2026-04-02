import z from "zod";
import { TErrorResponse, TErrorSources } from "../interface/error.interface";
import { StatusCodes } from "http-status-codes";

export const handleZodError = (error: z.ZodError): TErrorResponse => {

    const statusCode = StatusCodes.BAD_REQUEST;
    const message = "zod validation error";
    const errorSources: TErrorSources[] = [];
    error.issues.forEach((issue) => {
        errorSources.push({
            path: issue.path.join(" => "),
            message: issue.message,
        })
    })
    return {
        statusCode,
        success: false,
        message,
        errorSources
    }
}