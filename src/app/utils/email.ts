import nodemailer from "nodemailer"
import AppError from "../errorHelpers/AppError";
import { StatusCodes } from "http-status-codes";
import ejs from "ejs";

import path from "path";
import { envVars } from "../config/env";
const transporter = nodemailer.createTransport({
    host: envVars.Email_Sender.EMAIL_SENDER_USER_SMTP_HOST,
    secure: true,
    auth: {
        user: envVars.Email_Sender.EMAIL_SENDER_USER_USER,
        pass: envVars.Email_Sender.EMAIL_SENDER_USER_PASS
    },
    port: Number(envVars.Email_Sender.EMAIL_SENDER_USER_SMTP_PORT)

})
interface SendEmailOptions {
    to: string;
    subject: string;
    templateName: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    templateData: Record<string, any>;
    attachments?: {
        filename: string;
        content: Buffer | string;
        contentType: string;
    }[]

}
export const sendEmail = async ({ subject, templateData, templateName, to, attachments }: SendEmailOptions) => {
    try {
        const templatePath = path.resolve(process.cwd(), `src/app/templates/${templateName}`)
        const html = await ejs.renderFile(templatePath, templateData)
        const info = await transporter.sendMail({
            from: envVars.Email_Sender.EMAIL_SENDER_USER_SMTP_FROM,
            to: to,
            subject: subject,
            html: html,
            attachments: attachments?.map((attachment) => ({
                filename: attachment.filename,
                content: attachment.content,
                contentType: attachment.contentType,
            }))
        })
        console.log(`Email sent to ${to}: ${info.messageId}`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        console.log("Email sending error", error.message);
        throw new AppError(StatusCodes.INTERNAL_SERVER_ERROR, "Failed to send email")

    }
}