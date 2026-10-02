import { Request, Response } from "express";
import Stripe from "stripe";
import { envVars } from "../../config/env";
import { stripe } from "../../config/stripe.config";
import { PaymentService } from "./payment.service";
import { sendResponse } from "../../shared/sendResponse";
import AppError from "../../errorHelpers/AppError";
import { catchAsync } from "../../shared/catchAsync";
import { IQueryParams } from "../../interface/query.interface";

// POST /webhook (raw body, see app.ts). Stripe retries any non-2xx answer for up to 3 days, so:
// - bad signature           -> 400 (not from Stripe)
// - our own 4xx (not found…) -> 200 + log (a retry would fail the same way)
// - unexpected error        -> 500 (temporary problem, e.g. DB down: let Stripe retry)
const handleStripeEventWebhook = async (req: Request, res: Response) => {
  const signature = req.headers["stripe-signature"];
  const webhookSecret = envVars.STRIPE.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) {
    return res.status(400).json({ success: false, message: "Missing Stripe signature" });
  }

  let event: Stripe.Event;
  try {
    // verifies the payload really comes from Stripe and wasn't changed
    event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
  } catch (error) {
    console.warn("[stripe-webhook] signature verification failed:", (error as Error).message);
    return res.status(400).json({ success: false, message: "Invalid signature" });
  }

  try {
    const result = await PaymentService.handleStripeEventWebhook(event);
    sendResponse(res, {
      httpStatusCode: 200,
      success: true,
      message: "Event processed",
      data: result,
    });
  } catch (error) {
    if (error instanceof AppError && error.statusCode < 500) {
      console.error(`[stripe-webhook] ${event.type} ${event.id} not processed:`, error.message);
      return res.status(200).json({ success: false, message: error.message });
    }
    console.error(`[stripe-webhook] ${event.type} ${event.id} failed, Stripe will retry:`, error);
    return res.status(500).json({ success: false, message: "Webhook processing failed" });
  }
};

const getAllPayments = catchAsync(async (req: Request, res: Response) => {
  const result = await PaymentService.getAllPayments(req.query as IQueryParams);
  sendResponse(res, { httpStatusCode: 200, success: true, message: "Payments fetched", data: result.data, meta: result.meta });
});
export const PaymentController = {
  getAllPayments,
  handleStripeEventWebhook,
};
