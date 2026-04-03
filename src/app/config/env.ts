import { StatusCodes } from "http-status-codes";
import AppError from "../errorHelpers/AppError";

interface EnvConfig {
    PORT: string,
    BETTER_AUTH_SECRET: string,
    BETTER_AUTH_URL: string,
    NODE_ENV: string,
    DATABASE_URL: string
}
const loadEnvVariables = (): EnvConfig => {
    const requiredEnvVars = ['PORT', 'BETTER_AUTH_SECRET', 'BETTER_AUTH_URL', 'NODE_ENV'];
    requiredEnvVars.forEach((varName) => {
        if (!process.env[varName]) {
            throw new AppError(StatusCodes.BAD_REQUEST, `Environment variable ${varName} is required but not defined.`);
        }
    });
    return {
        PORT: process.env.PORT,
        BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
        BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
        NODE_ENV: process.env.NODE_ENV,
        DATABASE_URL: process.env.DATABASE_URL
    } as EnvConfig;

}
export const envVars = loadEnvVariables()