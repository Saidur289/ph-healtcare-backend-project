/* eslint-disable @typescript-eslint/no-explicit-any */
import { PaymentStatus } from "./../../../generated/prisma/client";
import Stripe from "stripe";
import { prisma } from "../../lib/prisma";
import { generateInvoicePDF } from "./payment.utils";
import { uploadFileToCloudinary } from "../../config/cloudinary.config";
import { sendEmail } from "../../utils/email";

const handleStripeEventWebhook = async (event: Stripe.Event) => {
  const existingPayment = await prisma.payment.findUnique({
    where: {
      stripeEventId: event.id,
    },
  });
  if (existingPayment) {
    console.log(`Event already processed ${event.id} skipping`);
    return { message: `Event already processed ${event.id} skipping` };
  }
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const paymentId = session.metadata?.paymentId;
      const appointmentId = session.metadata?.appointmentId;
      if (!paymentId || !appointmentId) {
        console.log(
          `Event data missing paymentId or appointmentId ${event.id} skipping`,
        );
        return {
          message: `Event data missing paymentId or appointmentId ${event.id} skipping`,
        };
      }
      const appointmentData = await prisma.appointment.findUnique({
        where: {
          id: appointmentId,
        },
        include: {
          patient: true,
          doctor: true,
          schedule: true,
          payment: true,
        },
      });
      if (!appointmentData) {
        console.log(
          `Event data missing paymentId or appointmentId ${event.id} skipping`,
        );
        return {
          message: `Event data missing paymentId or appointmentId ${event.id} skipping`,
        };
      }
      let pdfBuffer: Buffer | null = null;
      const result = await prisma.$transaction(async (tx) => {
        const updatedAppointment = await tx.appointment.update({
          where: {
            id: appointmentId,
          },
          data: {
            paymentStatus:
              session.payment_status === "paid"
                ? PaymentStatus.PAID
                : PaymentStatus.UNPAID,
          },
        });
        let invoiceUrl = null;
        if (session.payment_status === "paid") {
          //generate invoice pdf
          try {
            pdfBuffer = await generateInvoicePDF({
              patientEmail: appointmentData.patient.email,
              patientName: appointmentData.patient.name,
              doctorName: appointmentData.doctor.name,
              amount: appointmentData.doctor.appointmentFee || 0,
              appointmentDate:
                appointmentData.schedule.startDateTime.toISOString(),
              transactionId: appointmentData.payment?.transactionId || "",
              invoiceId: appointmentData.payment?.id || "",
              paymentDate: new Date().toISOString(),
            });
            const uploadApiResponse = await uploadFileToCloudinary(
              pdfBuffer,
              `ph-healthcare/invoices/invoice-${paymentId}-${Date.now()}.pdf`,
            );
            invoiceUrl = uploadApiResponse.secure_url;
          } catch (error) {
            console.log("Error in pdf created", error);
          }
        }

        const updatedPayment = await tx.payment.update({
          where: {
            id: paymentId,
          },
          data: {
            stripeEventId: event.id,
            paymentGatewayData: session as any,
            invoiceUrl,
            status:
              session.payment_status === "paid"
                ? PaymentStatus.PAID
                : PaymentStatus.UNPAID,
          },
        });
        return { updatedAppointment, invoiceUrl, updatedPayment };
      });
      if (session.payment_status === "paid" && result.invoiceUrl) {
        console.log(
          "Invoice generated and uploaded successfully",
          result.invoiceUrl,
        );
        try {
          await sendEmail({
            to: appointmentData.patient.email,
            subject: `Invoice for your appointment with Dr. ${appointmentData.doctor.name}`,
            templateName: "invoice",
            templateData: {
              doctorName: appointmentData.doctor.name,
              patientName: appointmentData.patient.name,
              invoiceUrl: result.invoiceUrl,
              paymentDate: new Date().toLocaleDateString(),
              transactionId: result.updatedPayment.transactionId,
              amount: appointmentData.doctor.appointmentFee || 0,
              appointmentDate:
                appointmentData.schedule.startDateTime.toLocaleDateString(),
              invoiceId: appointmentData.patient.id,
            },
            attachments: [
              {
                filename: `invoice-${paymentId}.pdf`,
                content: pdfBuffer || Buffer.from(""), // Use the generated PDF buffer
                contentType: "application/pdf",
              },
            ],
          });
          console.log(
            "Invoice email sent successfully to ",
            appointmentData.patient.email,
          );
        } catch (error) {
          console.log("error send invoice ", error);
        }
      }
      console.log(
        `payment process successfully with ${paymentId} and ${appointmentId}`,
      );
      break;
    }
    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      console.log(`session expired ${session.id}`);
      break;
    }
    case "payment_intent.payment_failed": {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      console.log(`payment_intent.payment_failed ${paymentIntent.id}`);
      break;
    }
    default: {
      console.log(`Unhandled event type ${event.type}`);
      break;
    }
  }
  return { message: "success" };
};
export const PaymentService = {
  handleStripeEventWebhook,
};
