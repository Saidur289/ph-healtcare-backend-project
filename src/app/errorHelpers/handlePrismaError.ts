import { StatusCodes } from "http-status-codes";
import { Prisma } from "../../generated/prisma/client";
import { TErrorResponse, TErrorSources } from "../interface/error.interface";
import { envVars } from "../config/env";

// DB details (table, column, constraint, raw message) are only shown in development
const isDev = envVars.NODE_ENV === "development";

const getStatusCodeFromPrismaError = (rawCode: string): number => {
  // Prisma codes are uppercase ("P2002"); normalise just in case
  const errorCode = rawCode.toUpperCase();
  // P2002: unique constraint violation
  if (errorCode === "P2002") {
    return StatusCodes.CONFLICT;
  }
  // P2025, P2015, P2018: record not found
  if (["P2025", "P2015", "P2018"].includes(errorCode)) {
    return StatusCodes.NOT_FOUND;
  }
  // P2034: write conflict / deadlock between two transactions -> the client may retry
  if (errorCode === "P2034") {
    return StatusCodes.CONFLICT;
  }
  // P2028: no DB connection free in time (server busy), not a client mistake
  if (errorCode === "P2028") {
    return StatusCodes.SERVICE_UNAVAILABLE;
  }
  // P2003: foreign key constraint failed (related record missing / still in use)
  if (errorCode === "P2003") {
    return StatusCodes.CONFLICT;
  }
  // P5011: rate limit exceeded
  if (errorCode === "P5011") {
    return StatusCodes.TOO_MANY_REQUESTS;
  }
  // P1xxx, P2024 (pool timeout), P2037, P6008: database unavailable.
  // P1000/P1010 are *database* auth problems, never the end user's fault -> 503 too.
  if (
    errorCode.startsWith("P1") ||
    ["P2024", "P2037", "P6008"].includes(errorCode)
  ) {
    return StatusCodes.SERVICE_UNAVAILABLE;
  }
  // other P2xxx: bad input
  if (errorCode.startsWith("P2")) {
    return StatusCodes.BAD_REQUEST;
  }
  return StatusCodes.INTERNAL_SERVER_ERROR;
};

// short, safe message for users (no table/column names)
const getPublicMessage = (statusCode: number, meta?: Record<string, unknown>) => {
  switch (statusCode) {
    case StatusCodes.CONFLICT: {
      const target = Array.isArray(meta?.target)
        ? (meta.target as string[]).join(", ")
        : undefined;
      return target
        ? `A record with this ${target} already exists or is still in use`
        : "This record already exists or is still in use";
    }
    case StatusCodes.NOT_FOUND:
      return "Requested record was not found";
    case StatusCodes.TOO_MANY_REQUESTS:
      return "Too many requests, please try again later";
    case StatusCodes.SERVICE_UNAVAILABLE:
      return "Database is temporarily unavailable, please try again later";
    case StatusCodes.BAD_REQUEST:
      return "Invalid request data";
    default:
      return "Something went wrong";
  }
};
const formatErrorMeta = (meta?: Record<string, unknown>): string => {
  if (!meta) return "";
  const parts: string[] = [];
  if (meta.target) {
    parts.push(`Field(s): ${String(meta.target)}`);
  }
  if (meta.field_name) {
    parts.push(`Field: ${String(meta.field_name)}`);
  }
  if (meta.model_name) {
    parts.push(`Model: ${String(meta.model_name)}`);
  }
  if (meta.table) {
    parts.push(`Table: ${String(meta.table)}`);
  }
  if (meta.relation_name) {
    parts.push(`Relation: ${String(meta.relation_name)}`);
  }
  if (meta.column_name) {
    parts.push(`Column: ${String(meta.column_name)}`);
  }
  if (meta.constraint) {
    parts.push(`Constraint: ${String(meta.constraint)}`);
  }
  if (meta.database_error) {
    parts.push(`Database Error: ${String(meta.database_error)}`);
  }
  return parts.length > 0 ? parts.join(" |") : "";
};

const handlePrismaClientKnownRequestError = (
  error: Prisma.PrismaClientKnownRequestError,
): TErrorResponse => {
  const statusCode = getStatusCodeFromPrismaError(error.code);
  if (!isDev) {
    const message = getPublicMessage(statusCode, error.meta);
    return {
      success: false,
      statusCode,
      message,
      errorSources: [{ path: "", message }],
    };
  }
  const metaInfo = formatErrorMeta(error.meta);
  let cleanMessage = error.message;
  cleanMessage = cleanMessage.replace(/invalid `.*?` invocation: ?\s*/i, "");
  const lines = cleanMessage.split("\n").filter((line) => line.trim() !== "");
  const mainMessage = lines[0];
  const errorSources: TErrorSources[] = [
    {
      path: error.code,
      message: metaInfo ? `${mainMessage} | ${metaInfo}` : mainMessage,
    },
  ];
  if (error.meta?.cause) {
    errorSources.push({
      path: error.code,
      message: String(error.meta.cause),
    });
  }
  return {
    success: false,
    statusCode,
    message: `Prisma Client Error : ${mainMessage}`,
    errorSources,
  };
};
const handlePrismaClientUnknownRequestError = (
  error: Prisma.PrismaClientUnknownRequestError,
): TErrorResponse => {
  const cleanMessage = error.message.replace(
    /invalid `.*?` invocation: ?\s*/i,
    "",
  );
  const lines = cleanMessage.split("\n").filter((line) => line.trim() !== "");
  const mainMessage =
    lines[0] || "An unknown error occurred with the database operation";
  const errorSources: TErrorSources[] = [
    {
      path: "Unknown Prisma Error",
      message: mainMessage,
    },
  ];
  return {
    success: false,
    statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
    message: `Prisma Client Error : ${mainMessage}`,
    errorSources,
  };
};
const handlePrismaClientInitializationError = (
  error: Prisma.PrismaClientInitializationError,
): TErrorResponse => {
  const cleanMessage = error.message.replace(
    /invalid `.*?` invocation: ?\s*/i,
    "",
  );
  const statusCode = error.errorCode
    ? getStatusCodeFromPrismaError(error.errorCode)
    : StatusCodes.SERVICE_UNAVAILABLE;
  const lines = cleanMessage.split("\n").filter((line) => line.trim() !== "");
  const mainMessage =
    lines[0] ||
    "An unknown error occurred with the initialization of the database error";
  const errorSources: TErrorSources[] = [
    {
      path: error.errorCode || "initialization error",
      message: mainMessage,
    },
  ];
  return {
    success: false,
    statusCode,
    message: `Prisma Client initialization Error : ${mainMessage}`,
    errorSources,
  };
};
const handlePrismaClientRustPanicError = (): TErrorResponse => {
  const errorSources: TErrorSources[] = [
    {
      path: "Rust panic error",
      message:
        "An unknown error occurred with the rust panic error and This is a usually dua to a internal error",
    },
  ];
  return {
    success: false,
    statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
    message:
      "An unknown error occurred with the rust panic error and This is a usually dua to a internal error",
    errorSources,
  };
};
const handlePrismaClientValidationError = (
  error: Prisma.PrismaClientValidationError,
): TErrorResponse => {
  let cleanMessage = error.message;
  cleanMessage = cleanMessage.replace(/Invalid `.*?` invocation:?\s*/i, "");
  const lines = cleanMessage.split("\n").filter((line) => line.trim());
  const errorSources: TErrorSources[] = [];
  const fieldMatch = cleanMessage.match(/Argument `(\w+)`/i);
  const fieldName = fieldMatch ? fieldMatch[0] : "Unknown Field";
  //main message
  const mainMessage =
    lines.find(
      (line) =>
        !line.includes("Argument") && !line.includes("→") && line.length > 10,
    ) ||
    lines[0] ||
    "Invalid query parameters provided to the database operation.";

  errorSources.push({
    path: fieldName,
    message: mainMessage,
  });
  return {
    success: false,
    statusCode: StatusCodes.BAD_REQUEST,
    message: `Prisma Client validation error: ${mainMessage}`,
    errorSources,
  };
};

// outside development, replace raw Prisma text (it contains table/column/query details)
const toPublicResponse = (response: TErrorResponse): TErrorResponse => {
  if (isDev) return response;
  const statusCode = response.statusCode ?? StatusCodes.INTERNAL_SERVER_ERROR;
  const message = getPublicMessage(statusCode);
  return {
    success: false,
    statusCode,
    message,
    errorSources: [{ path: "", message }],
  };
};

const handleUnknownRequestErrorSafe = (
  error: Prisma.PrismaClientUnknownRequestError,
) => toPublicResponse(handlePrismaClientUnknownRequestError(error));
const handleInitializationErrorSafe = (
  error: Prisma.PrismaClientInitializationError,
) => toPublicResponse(handlePrismaClientInitializationError(error));
const handleValidationErrorSafe = (
  error: Prisma.PrismaClientValidationError,
) => toPublicResponse(handlePrismaClientValidationError(error));

export {
  handlePrismaClientKnownRequestError,
  handleUnknownRequestErrorSafe as handlePrismaClientUnknownRequestError,
  handleInitializationErrorSafe as handlePrismaClientInitializationError,
  handlePrismaClientRustPanicError,
  handleValidationErrorSafe as handlePrismaClientValidationError,
};
