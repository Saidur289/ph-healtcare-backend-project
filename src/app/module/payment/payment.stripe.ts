import { StatusCodes } from "http-status-codes";
import { stripe } from "../../config/stripe.config";
import { envVars } from "../../config/env";
import AppError from "../../errorHelpers/AppError";
import { minutes } from "../appointment/appointment.constant";

// Stripe Checkout sessions must expire between 30 minutes and 24 hours from now
const clampSessionExpiry = (wanted: Date) => {
  const min = Date.now() + minutes(31);
  const max = Date.now() + minutes(23 * 60);
  return new Date(Math.min(Math.max(wanted.getTime(), min), max));
};

// Never call this inside a DB transaction (slow network call).
export const createCheckoutSession = async (input: {
  appointmentId: string;
  paymentId: string;
  doctorName: string;
  amount: number;
  expiresAt: Date;
}) => {
  const expiresAt = clampSessionExpiry(input.expiresAt);
  const session = await stripe.checkout.sessions.create(
    {
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "bdt",
            product_data: {
              name: `Appointment with Dr. ${input.doctorName}`,
            },
            // Stripe wants an integer in the smallest unit (poisha)
            unit_amount: Math.round(input.amount * 100),
          },
          quantity: 1,
        },
      ],
      client_reference_id: input.appointmentId,
      metadata: {
        appointmentId: input.appointmentId,
        paymentId: input.paymentId,
      },
      expires_at: Math.floor(expiresAt.getTime() / 1000),
      success_url: `${envVars.FRONTEND_URL}/dashboard/my-appointments?payment=success&appointment_id=${input.appointmentId}`,
      cancel_url: `${envVars.FRONTEND_URL}/dashboard/my-appointments?payment=cancelled&appointment_id=${input.appointmentId}`,
    },
    // same payment + expiry -> Stripe returns the same session on a retry
    { idempotencyKey: `checkout-${input.paymentId}-${expiresAt.getTime()}` },
  );
  return { session, expiresAt };
};

// best effort: an already expired/completed session is fine
export const expireCheckoutSession = async (sessionId?: string | null) => {
  if (!sessionId) return;
  try {
    await stripe.checkout.sessions.expire(sessionId);
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code !== "resource_missing") {
      console.error("Failed to expire Stripe session:", (error as Error).message);
    }
  }
};

// open session that can still be paid, or null
export const getOpenCheckoutUrl = async (sessionId?: string | null) => {
  if (!sessionId) return null;
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    return session.status === "open" ? session.url : null;
  } catch {
    return null;
  }
};

// Refund a paid Checkout payment. paymentGatewayData is the Checkout session saved by the webhook.
export const refundCheckoutPayment = async (input: {
  paymentId: string;
  paymentGatewayData: unknown;
}) => {
  const gateway = input.paymentGatewayData as { payment_intent?: string | { id: string } } | null;
  const paymentIntent =
    typeof gateway?.payment_intent === "string"
      ? gateway.payment_intent
      : gateway?.payment_intent?.id;
  if (!paymentIntent) {
    throw new AppError(
      StatusCodes.CONFLICT,
      "This payment can't be refunded automatically. Please contact support.",
    );
  }
  try {
    const refund = await stripe.refunds.create(
      { payment_intent: paymentIntent },
      { idempotencyKey: `refund-${input.paymentId}` },
    );
    return refund.id;
  } catch (error) {
    console.error("Stripe refund failed:", (error as Error).message);
    throw new AppError(
      StatusCodes.BAD_GATEWAY,
      "The refund could not be processed right now. Please try again later.",
    );
  }
};
