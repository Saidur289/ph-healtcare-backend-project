import Stripe from "stripe";
import { envVars } from "../../config/env";
import { uploadPrivateFile } from "../../config/privateFiles";
import { Payment, Prisma } from "../../../generated/prisma/client";
import { QueryBuilder } from "../../utils/QueryBuilder";
import { IQueryParams } from "../../interface/query.interface";
import {
  AppointmentStatus,
  CancelledBy,
  PaymentStatus,
} from "../../../generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import { generateInvoicePDF } from "./payment.utils";
import { sendEmail } from "../../utils/email";
import { stripe } from "../../config/stripe.config";
import { refundCheckoutPayment } from "./payment.stripe";
import { AppointmentService } from "../appointment/appointment.service";

// INVOICE_DELIVERY=off skips the PDF upload + email (for tests / CI). Invoice numbers are still assigned.
const isInvoiceDeliveryEnabled = () => process.env.INVOICE_DELIVERY !== "off";

const paymentIntentIdOf = (value: string | { id: string } | null | undefined) =>
  typeof value === "string" ? value : (value?.id ?? null);

// ------------------------------------------------------------------ idempotency

// Returns false when this event id was already processed (Stripe retries and duplicates).
const claimEvent = async (event: Stripe.Event) => {
  try {
    await prisma.stripeWebhookEvent.create({ data: { id: event.id, type: event.type } });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return false;
    }
    throw error;
  }
};

// processing failed for a temporary reason: forget the event so Stripe's retry runs it again
const releaseEvent = (eventId: string) =>
  prisma.stripeWebhookEvent.delete({ where: { id: eventId } }).catch(() => undefined);

// ------------------------------------------------------------------ handlers

// Paid Checkout. Only the fast DB update happens here (the webhook must answer quickly);
// the invoice PDF + email run afterwards in the background.
const handleCheckoutPaid = async (session: Stripe.Checkout.Session, eventId: string) => {
  if (session.payment_status !== "paid") {
    return { message: `Session ${session.id} is not paid yet` };
  }
  const paymentId = session.metadata?.paymentId;
  const payment = paymentId
    ? await prisma.payment.findUnique({ where: { id: paymentId }, include: { appointment: true } })
    : null;
  if (!payment) {
    console.error(`[stripe-webhook] paid session ${session.id} has no matching payment`);
    return { message: "No matching payment" };
  }
  if (payment.status === PaymentStatus.PAID || payment.status === PaymentStatus.REFUNDED) {
    return { message: `Payment ${payment.id} already ${payment.status}` };
  }

  const paymentIntentId = paymentIntentIdOf(session.payment_intent);
  // mark paid only while the appointment is still waiting for this payment
  const markedPaid = await prisma.$transaction(async (tx) => {
    const appointment = await tx.appointment.updateMany({
      where: {
        id: payment.appointmentId,
        status: AppointmentStatus.SCHEDULED,
        paymentStatus: PaymentStatus.UNPAID,
      },
      data: { paymentStatus: PaymentStatus.PAID },
    });
    if (appointment.count !== 1) return false;
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.PAID,
        paidAt: new Date(),
        stripePaymentIntentId: paymentIntentId,
        stripeEventId: eventId,
        paymentGatewayData: session as unknown as Prisma.InputJsonValue,
        checkoutUrl: null,
      },
    });
    return true;
  });

  if (!markedPaid) {
    // money arrived for an appointment that was cancelled (e.g. deadline passed): refund it
    const refundId = await refundCheckoutPayment({ paymentId: payment.id, paymentGatewayData: session });
    await prisma.$transaction([
      prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.REFUNDED,
          refundId,
          refundedAt: new Date(),
          stripePaymentIntentId: paymentIntentId,
          stripeEventId: eventId,
          paymentGatewayData: session as unknown as Prisma.InputJsonValue,
        },
      }),
      prisma.appointment.update({
        where: { id: payment.appointmentId },
        data: { paymentStatus: PaymentStatus.REFUNDED },
      }),
    ]);
    return { message: `Late payment for appointment ${payment.appointmentId} refunded` };
  }

  queueInvoice(payment.id);
  return { message: `Payment ${payment.id} marked as paid` };
};

// The Checkout session timed out without payment.
const handleCheckoutExpired = async (session: Stripe.Checkout.Session) => {
  const payment = await prisma.payment.findUnique({
    where: { checkoutSessionId: session.id },
    include: { appointment: true },
  });
  if (!payment || payment.status !== PaymentStatus.UNPAID) {
    return { message: "Nothing to do" };
  }
  if (payment.appointment.status !== AppointmentStatus.SCHEDULED) {
    return { message: "Appointment no longer active" };
  }
  if (payment.appointment.isPayLater) {
    // pay later: the patient may still start a new payment before the deadline
    await prisma.payment.update({
      where: { id: payment.id },
      data: { checkoutSessionId: null, checkoutUrl: null },
    });
    return { message: "Pay-later session expired; a new one can be started" };
  }
  // pay now: the window is over, free the slot
  await AppointmentService.cancelInTransaction(payment.appointmentId, {
    cancelledBy: CancelledBy.SYSTEM,
    reason: "Payment session expired",
    paymentStatus: PaymentStatus.EXPIRED,
  });
  return { message: `Appointment ${payment.appointmentId} cancelled (payment expired)` };
};

// A refund happened in Stripe (by us, or manually in the Stripe dashboard).
const handleChargeRefunded = async (charge: Stripe.Charge) => {
  if (!charge.refunded) {
    console.warn(`[stripe-webhook] partial refund on ${charge.id} - not handled automatically`);
    return { message: "Partial refund ignored" };
  }
  const paymentIntentId = paymentIntentIdOf(charge.payment_intent);
  const payment = paymentIntentId
    ? await prisma.payment.findUnique({
        where: { stripePaymentIntentId: paymentIntentId },
        include: { appointment: true },
      })
    : null;
  if (!payment) {
    console.error(`[stripe-webhook] refunded charge ${charge.id} has no matching payment`);
    return { message: "No matching payment" };
  }
  if (payment.status === PaymentStatus.REFUNDED) {
    return { message: "Already refunded" };
  }
  const refundId = charge.refunds?.data?.[0]?.id ?? payment.refundId ?? undefined;
  if (payment.appointment.status === AppointmentStatus.SCHEDULED) {
    // refunded from the Stripe dashboard while still booked: cancel and free the slot
    await AppointmentService.cancelInTransaction(payment.appointmentId, {
      cancelledBy: CancelledBy.ADMIN,
      reason: "Payment refunded in Stripe",
      paymentStatus: PaymentStatus.REFUNDED,
      refundId,
    });
  } else {
    await prisma.$transaction([
      prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.REFUNDED, refundId, refundedAt: new Date() },
      }),
      prisma.appointment.update({
        where: { id: payment.appointmentId },
        data: { paymentStatus: PaymentStatus.REFUNDED },
      }),
    ]);
  }
  return { message: `Payment ${payment.id} marked as refunded` };
};

const handleStripeEventWebhook = async (event: Stripe.Event) => {
  if (!(await claimEvent(event))) {
    return { message: `Event ${event.id} already processed` };
  }
  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        return await handleCheckoutPaid(event.data.object as Stripe.Checkout.Session, event.id);
      case "checkout.session.expired":
        return await handleCheckoutExpired(event.data.object as Stripe.Checkout.Session);
      case "charge.refunded":
        return await handleChargeRefunded(event.data.object as Stripe.Charge);
      default:
        return { message: `Event type ${event.type} ignored` };
    }
  } catch (error) {
    await releaseEvent(event.id);
    throw error;
  }
};

// ------------------------------------------------------------------ invoices

// "INV-2026-000123": a per-year counter, incremented atomically (INSERT ... ON CONFLICT)
const nextInvoiceNumber = async () => {
  const year = new Date().getFullYear();
  const counter = await prisma.invoiceCounter.upsert({
    where: { year },
    create: { year, last: 1 },
    update: { last: { increment: 1 } },
  });
  return `INV-${year}-${String(counter.last).padStart(6, "0")}`;
};

// Assigns the invoice number, then (if enabled) creates the PDF, uploads it and emails it.
// Safe to call more than once: it stops when the invoice already exists.
const generateAndSendInvoice = async (paymentId: string) => {
  let payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { appointment: { include: { patient: true, doctor: true, schedule: true } } },
  });
  if (!payment || payment.status !== PaymentStatus.PAID || payment.invoiceUrl) return;

  if (!payment.invoiceNumber) {
    const invoiceNumber = await nextInvoiceNumber();
    await prisma.payment.updateMany({
      where: { id: payment.id, invoiceNumber: null },
      data: { invoiceNumber },
    });
    payment = await prisma.payment.findUniqueOrThrow({
      where: { id: paymentId },
      include: { appointment: { include: { patient: true, doctor: true, schedule: true } } },
    });
  }
  if (!isInvoiceDeliveryEnabled()) return;

  const { appointment } = payment;
  const invoiceNumber = payment.invoiceNumber as string;
  const paymentDate = (payment.paidAt ?? new Date()).toISOString();
  const pdfBuffer = await generateInvoicePDF({
    invoiceId: invoiceNumber,
    patientEmail: appointment.patient.email,
    patientName: appointment.patient.name,
    doctorName: appointment.doctor.name,
    // what the patient actually paid, not the doctor's current fee
    amount: payment.amount,
    appointmentDate: appointment.schedule.startDateTime.toISOString(),
    transactionId: payment.transactionId,
    paymentDate,
  });
  // private file reference (privateFiles.ts); the patient downloads it through the app
  const invoiceRef = await uploadPrivateFile(pdfBuffer, "pdf", "invoices");
  await prisma.payment.update({
    where: { id: payment.id },
    data: { invoiceUrl: invoiceRef },
  });
  await sendEmail({
    to: appointment.patient.email,
    subject: `Invoice ${invoiceNumber} for your appointment with Dr. ${appointment.doctor.name}`,
    templateName: "invoice",
    templateData: {
      doctorName: appointment.doctor.name,
      patientName: appointment.patient.name,
      invoiceUrl: `${envVars.FRONTEND_URL}/dashboard/my-appointments?tab=past`,
      paymentDate: new Date(paymentDate).toLocaleDateString(),
      transactionId: payment.transactionId,
      amount: payment.amount,
      appointmentDate: appointment.schedule.startDateTime.toLocaleDateString(),
      invoiceId: invoiceNumber,
    },
    attachments: [
      {
        filename: `${invoiceNumber}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });
};

// run after the webhook has answered; failures are retried by retryMissingInvoices()
const queueInvoice = (paymentId: string) => {
  setImmediate(() => {
    generateAndSendInvoice(paymentId).catch((error) =>
      console.error(`[invoice] payment ${paymentId} failed:`, error?.message),
    );
  });
};

// cron: paid payments that still have no invoice after 10 minutes
const retryMissingInvoices = async () => {
  const pending = await prisma.payment.findMany({
    where: {
      status: PaymentStatus.PAID,
      ...(isInvoiceDeliveryEnabled() ? { invoiceUrl: null } : { invoiceNumber: null }),
      paidAt: { lt: new Date(Date.now() - 10 * 60 * 1000) },
    },
    select: { id: true },
    take: 20,
  });
  for (const { id } of pending) {
    await generateAndSendInvoice(id).catch((error) =>
      console.error(`[invoice] retry for payment ${id} failed:`, error?.message),
    );
  }
  return pending.length;
};

// ------------------------------------------------------------------ reconciliation

// Daily check that Stripe and the DB agree (last 3 days). Only reports: a person decides
// what to do. Read-only, so running it twice is harmless.
const reconcilePayments = async () => {
  const since = Math.floor((Date.now() - 3 * 24 * 60 * 60 * 1000) / 1000);
  const problems: string[] = [];
  let checked = 0;

  for await (const session of stripe.checkout.sessions.list({
    created: { gte: since },
    status: "complete",
    limit: 100,
  })) {
    checked++;
    const paymentId = session.metadata?.paymentId;
    if (!paymentId || session.payment_status !== "paid") continue;
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) {
      problems.push(`Stripe session ${session.id} is paid but payment ${paymentId} does not exist`);
    } else if (payment.status !== PaymentStatus.PAID && payment.status !== PaymentStatus.REFUNDED) {
      problems.push(`Stripe session ${session.id} is paid but payment ${paymentId} is ${payment.status}`);
    }
  }

  const paidWithoutStripe = await prisma.payment.findMany({
    where: {
      status: PaymentStatus.PAID,
      stripePaymentIntentId: null,
      paidAt: { gte: new Date(since * 1000) },
    },
    select: { id: true },
  });
  paidWithoutStripe.forEach(({ id }) =>
    problems.push(`Payment ${id} is PAID in the DB but has no Stripe payment intent`),
  );

  if (problems.length > 0) {
    // ALERT: picked up by log monitoring (plan.md 13.11)
    console.error(`[payment-reconciliation] ${problems.length} mismatch(es):\n- ${problems.join("\n- ")}`);
  }
  return { checked, problems };
};

// ADMIN: payments with the appointment, patient and doctor (no raw gateway data)
const getAllPayments = async (query: IQueryParams) => {
  const queryBuilder = new QueryBuilder<Payment, Prisma.PaymentWhereInput, Prisma.PaymentInclude>(prisma.payment, query, {
    searchableFields: ["invoiceNumber", "appointment.patient.name", "appointment.patient.email", "appointment.doctor.name"],
    filterableFields: ["status", "amount", "paidAt", "createdAt"],
    singleRelations: ["appointment"],
  });
  // fixed allowlist: paymentGatewayData, checkout URLs and Stripe ids never reach the browser
  return queryBuilder
    .search()
    .filter()
    .select({
      id: true,
      amount: true,
      status: true,
      invoiceNumber: true,
      invoiceUrl: true,
      paidAt: true,
      refundedAt: true,
      createdAt: true,
      appointment: {
        select: {
          id: true,
          status: true,
          patient: { select: { id: true, name: true, email: true } },
          doctor: { select: { id: true, name: true } },
          schedule: { select: { startDateTime: true, endDateTime: true } },
        },
      },
    })
    .sort()
    .paginate()
    .execute();
};
export const PaymentService = {
  getAllPayments,
  handleStripeEventWebhook,
  generateAndSendInvoice,
  retryMissingInvoices,
  reconcilePayments,
};
