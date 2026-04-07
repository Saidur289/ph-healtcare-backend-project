import { StatusCodes } from "http-status-codes";
import AppError from "../errorHelpers/AppError";

interface EnvConfig {
    PORT: string,
    BETTER_AUTH_SECRET: string,
    BETTER_AUTH_URL: string,
    NODE_ENV: string,
    DATABASE_URL: string,
    JWT_SECRET_KEY: string,
    JWT_EXPIRES_IN: string,
    ACCESS_TOKEN_SECRET: string,
    REFRESH_TOKEN_SECRET: string,
    ACCESS_TOKEN_EXPIRES_IN: string,
    REFRESH_TOKEN_EXPIRES_IN: string,
    BETTER_AUTH_SESSION_TOKEN_EXPIRES_IN: string;
    BETTER_AUTH_SESSION_TOKEN_UPDATE_AGE: string;
    Email_Sender: {
        EMAIL_SENDER_USER_PASS: string;
        EMAIL_SENDER_USER_USER: string;
        EMAIL_SENDER_USER_SMTP_HOST: string
        EMAIL_SENDER_USER_SMTP_PORT: string;
        EMAIL_SENDER_USER_SMTP_FROM: string
    }
}
const loadEnvVariables = (): EnvConfig => {
    const requiredEnvVars = ['PORT', 'BETTER_AUTH_SECRET', 'BETTER_AUTH_URL', 'NODE_ENV', "JWT_SECRET_KEY", "JWT_EXPIRES_IN", "ACCESS_TOKEN_SECRET", "REFRESH_TOKEN_SECRET", "ACCESS_TOKEN_EXPIRES_IN", "REFRESH_TOKEN_EXPIRES_IN", "BETTER_AUTH_SESSION_TOKEN_EXPIRES_IN", "BETTER_AUTH_SESSION_TOKEN_UPDATE_AGE", "EMAIL_SENDER_USER_PASS", "EMAIL_SENDER_USER_USER", "EMAIL_SENDER_USER_SMTP_HOST", "EMAIL_SENDER_USER_SMTP_PORT", "EMAIL_SENDER_USER_SMTP_FROM"];
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
        DATABASE_URL: process.env.DATABASE_URL,
        JWT_SECRET_KEY: process.env.JWT_SECRET_KEY,
        JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN,
        ACCESS_TOKEN_SECRET: process.env.ACCESS_TOKEN_SECRET,
        REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET,
        ACCESS_TOKEN_EXPIRES_IN: process.env.ACCESS_TOKEN_EXPIRES_IN,
        REFRESH_TOKEN_EXPIRES_IN: process.env.REFRESH_TOKEN_EXPIRES_IN,
        BETTER_AUTH_SESSION_TOKEN_EXPIRES_IN: process.env.BETTER_AUTH_SESSION_TOKEN_EXPIRES_IN,
        BETTER_AUTH_SESSION_TOKEN_UPDATE_AGE: process.env.BETTER_AUTH_SESSION_TOKEN_UPDATE_AGE,
        Email_Sender: {
            EMAIL_SENDER_USER_PASS: process.env.EMAIL_SENDER_USER_PASS,
            EMAIL_SENDER_USER_USER: process.env.EMAIL_SENDER_USER_USER,
            EMAIL_SENDER_USER_SMTP_HOST: process.env.EMAIL_SENDER_USER_SMTP_HOST,
            EMAIL_SENDER_USER_SMTP_PORT: process.env.EMAIL_SENDER_USER_SMTP_PORT,
            EMAIL_SENDER_USER_SMTP_FROM: process.env.EMAIL_SENDER_USER_SMTP_FROM
        }
    } as EnvConfig;

}
export const envVars = loadEnvVariables()