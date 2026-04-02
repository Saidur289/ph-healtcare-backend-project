export interface TErrorSources {
    path: string;
    message: string;
}
export interface TErrorResponse {
    statusCode?: number;
    success: boolean;
    message: string;
    error?: unknown;
    errorSources?: TErrorSources[];
    stack?: string;
}