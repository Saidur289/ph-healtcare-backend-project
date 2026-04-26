/* eslint-disable @typescript-eslint/no-explicit-any */
import { PaymentStatus } from "./../../../generated/prisma/client";
import Stripe from "stripe";
import { prisma } from "../../lib/prisma";

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
      });
      if (!appointmentData) {
        console.log(
          `Event data missing paymentId or appointmentId ${event.id} skipping`,
        );
        return {
          message: `Event data missing paymentId or appointmentId ${event.id} skipping`,
        };
      }
      await prisma.$transaction(async (tx) => {
        await tx.appointment.update({
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
        await tx.payment.update({
          where: {
            id: paymentId,
          },
          data: {
            stripeEventId: event.id,
            paymentGatewayData: session as any,
            status:
              session.payment_status === "paid"
                ? PaymentStatus.PAID
                : PaymentStatus.UNPAID,
          },
        });
      });
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
