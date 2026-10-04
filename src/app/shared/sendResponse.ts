import { Response } from "express";
interface IResponseData<T> {
    httpStatusCode: number,
    success: boolean,
    message: string,
    data?: T,
    meta?: {
        page: number,
        limit: number,
        total: number,
        totalPages: number
    }
}

// Columns that hold private file references (config/privateFiles.ts). They are never sent
// to the browser: the value becomes true/false ("a file exists") and the file is read
// through /api/v1/files/..., which checks ownership, logs the read and returns a short-lived link.
const PRIVATE_FILE_KEYS = new Set(["pdfUrl", "invoiceUrl", "reportLink"]);

const hidePrivateFiles = (value: unknown, depth = 0): unknown => {
    if (depth > 12 || value === null || typeof value !== "object") return value;
    if (value instanceof Date) return value;
    if (Array.isArray(value)) return value.map((item) => hidePrivateFiles(item, depth + 1));
    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, item]) =>
            PRIVATE_FILE_KEYS.has(key) ? [key, Boolean(item)] : [key, hidePrivateFiles(item, depth + 1)],
        ),
    );
};

export const sendResponse = <T>(res: Response, responseData: IResponseData<T>) => {
    const { httpStatusCode, success, message, data, meta } = responseData
    res.status(httpStatusCode).json({
        success,
        message,
        data: hidePrivateFiles(data),
        meta
    })
}
