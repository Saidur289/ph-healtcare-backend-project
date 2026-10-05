// What each background job type does (queue: utils/jobQueue.ts). Imported by app.ts.
import { PaymentService } from "../module/payment/payment.service";
import { PrescriptionService } from "../module/prescription/prescription.service";
import { sendEmail } from "../utils/email";
import { registerJobHandler } from "../utils/jobQueue";

registerJobHandler("invoice.deliver", ({ paymentId }) => PaymentService.generateAndSendInvoice(paymentId));
registerJobHandler("prescription.deliver", ({ prescriptionId, reason }) =>
  PrescriptionService.deliverPrescription(prescriptionId, reason),
);
registerJobHandler("email.send", (mail) => sendEmail(mail));
