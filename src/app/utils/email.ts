import { raiseAlert } from "../lib/errorTracking";
import nodemailer from "nodemailer"
import AppError from "../errorHelpers/AppError";
import { StatusCodes } from "http-status-codes";
import ejs from "ejs";

import { appendFileSync } from "fs";
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
// End-to-end tests (scripts/e2e-server.ts): write emails to a JSON-lines file instead of
// sending them, so the tests can read verification codes. Ignored in production.
const outboxFile = envVars.NODE_ENV !== "production" ? process.env.EMAIL_OUTBOX_FILE : undefined;

export const sendEmail = async ({ subject, templateData, templateName, to, attachments }: SendEmailOptions) => {
    if (outboxFile) {
        appendFileSync(outboxFile, JSON.stringify({ to, subject, templateName, templateData, at: new Date().toISOString() }) + "\n");
        return;
    }
    try {
        const templatePath = path.resolve(process.cwd(), `src/app/templates/${templateName}.ejs`)
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
        // log the message id only, never the recipient address (personal data)
        console.log(`Email sent: ${info.messageId}`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        // the recipient is not logged (personal data)
        raiseAlert("email_failed", "email could not be sent", { template: templateName }, error);
        throw new AppError(StatusCodes.INTERNAL_SERVER_ERROR, "Failed to send email")

    }
}