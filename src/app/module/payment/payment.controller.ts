/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response } from "express";
import { envVars } from "../../config/env";
import { stripe } from "../../config/stripe.config";
import { PaymentService } from "./payment.service";
import { sendResponse } from "../../shared/sendResponse";

const handleStripeEventWebhook = async (req: Request, res: Response) => {
  /**
   * Get Stripe signature from request header
   * Stripe sends this header automatically
   * Used to verify request came from Stripe
   */
  const signature = req.headers["stripe-signature"];

  /**
   * Get webhook secret from environment variable
   * This secret comes from Stripe dashboard
   */
  const webhookSecret = envVars.STRIPE.STRIPE_WEBHOOK_SECRET;

  /**
   * Print signature + secret for debugging
   * Remove in production for security
   */
  // console.log(
  //   signature,
  //   webhookSecret,
  //   "........................................",
  // );

  /**
   * If signature missing OR secret missing
   * request cannot be verified
   */
  if (!signature || !webhookSecret) {
    return res.status(400).json({
      message: "Missing Stripe Signature or Webhook Secret",
    });
  }

  // Variable to store verified Stripe event
  let event;

  try {
    /**
     * Verify webhook payload using:
     * req.body          => raw request body
     * signature         => stripe-signature header
     * webhookSecret     => your webhook secret
     *
     * If valid:
     * event object returned
     *
     * If invalid:
     * throws error
     */
    event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);

    /**
     * Print verified Stripe event
     */
  } catch (err: any) {
    /**
     * Signature verification failed
     * Maybe fake request or body changed
     */
    console.log(`⚠️ Webhook signature verification failed.`, err.message);

    // Return 400 Bad Request
    return res.sendStatus(400);
  }

  try {
    /**
     * Send verified Stripe event
     * to service layer for processing
     *
     * Example events:
     * payment_intent.succeeded
     * payment_failed
     * refunded
     */
    const result = await PaymentService.handleStripeEventWebhook(event);

    /**
     * Custom success response
     * tells Stripe request handled successfully
     */
    sendResponse(res, {
      httpStatusCode: 200,
      success: true,
      message: "Event processed successfully",
      data: result,
    });
  } catch (error: any) {
    /**
     * If database update / service fails
     */
    console.log("failed in event", error.message);

    /**
     * Better to send response here also
     * Otherwise Stripe may retry
     */
    return res.status(500).json({
      success: false,
      message: "Webhook processing failed",
    });
  }
};
export const PaymentController = { handleStripeEventWebhook };
