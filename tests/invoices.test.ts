// Invoices (numbering, PDF + email, retry job), daily Stripe reconciliation and the admin
// payment list. Cloudinary uploads are faked here.
import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/app/lib/prisma";
import { PaymentService } from "../src/app/module/payment/payment.service";
import { PaymentStatus } from "../src/generated/prisma/enums";
import { createAdmin, createAppointment, createDoctor, createPatient, createSlot } from "./helpers/factories";
import { API, api, login } from "./helpers/http";
import { outbox, stripeState } from "./helpers/mocks";

vi.mock("../src/app/config/privateFiles", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/app/config/privateFiles")>()),
  uploadPrivateFile: vi.fn(async (_buffer: Buffer, format: string, folder: string) => `private:raw:ph-healthcare/private/${folder}/${randomUUID()}:${format}`),
}));

let doctorId: string;
let patient: Awaited<ReturnType<typeof createPatient>>;

beforeAll(async () => {
  doctorId = (await createDoctor()).doctor.id;
  patient = await createPatient();
});

afterEach(() => {
  process.env.INVOICE_DELIVERY = "off";
});

const paidPayment = async (options: { paidMinutesAgo?: number; stripePaymentIntentId?: string | null } = {}) => {
  const slot = await createSlot(doctorId, 24 * 60);
  const { appointment, payment } = await createAppointment({
    patientId: patient.patient.id,
    doctorId,
    scheduleId: slot.id,
    paymentStatus: PaymentStatus.PAID,
    amount: 1200,
    stripePaymentIntentId: options.stripePaymentIntentId === null ? undefined : (options.stripePaymentIntentId ?? `pi_test_${randomUUID()}`),
  });
  if (options.paidMinutesAgo) {
    await prisma.payment.update({ where: { id: payment.id }, data: { paidAt: new Date(Date.now() - options.paidMinutesAgo * 60_000) } });
  }
  return { appointment, payment };
};

describe("invoices", () => {
  it("numbers invoices per year without gaps or duplicates", async () => {
    const payments = await Promise.all([paidPayment(), paidPayment(), paidPayment()]);
    await Promise.all(payments.map(({ payment }) => PaymentService.generateAndSendInvoice(payment.id)));
    const numbers = (await prisma.payment.findMany({ where: { id: { in: payments.map((p) => p.payment.id) } } })).map((p) => p.invoiceNumber);
    const year = new Date().getFullYear();
    expect(numbers.every((n) => new RegExp(`^INV-${year}-\\d{6}$`).test(n ?? ""))).toBe(true);
    expect(new Set(numbers).size).toBe(3);
  });

  it("creates the PDF, stores it privately and emails it (delivery on)", async () => {
    process.env.INVOICE_DELIVERY = "on";
    const { payment } = await paidPayment();
    outbox.length = 0;
    await PaymentService.generateAndSendInvoice(payment.id);
    const after = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(after.invoiceUrl).toMatch(/^private:raw:ph-healthcare\/private\/invoices\//);
    expect(outbox).toHaveLength(1);
    expect(outbox[0].to).toBe(patient.email);
    expect(outbox[0].templateName).toBe("invoice");
    // the email links to the app, never to the stored file
    expect(String(outbox[0].templateData.invoiceUrl)).toMatch(/\/dashboard\/my-appointments/);
    // running again does nothing (already delivered)
    await PaymentService.generateAndSendInvoice(payment.id);
    expect(outbox).toHaveLength(1);
  });

  it("ignores unpaid payments", async () => {
    const slot = await createSlot(doctorId, 30 * 60);
    const { payment } = await createAppointment({ patientId: patient.patient.id, doctorId, scheduleId: slot.id });
    await PaymentService.generateAndSendInvoice(payment.id);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).invoiceNumber).toBeNull();
  });

  it("the retry job picks up paid payments still without an invoice after 10 minutes", async () => {
    const old = await paidPayment({ paidMinutesAgo: 20 });
    const recent = await paidPayment();
    expect(await PaymentService.retryMissingInvoices()).toBeGreaterThanOrEqual(1);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: old.payment.id } })).invoiceNumber).toBeTruthy();
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: recent.payment.id } })).invoiceNumber).toBeNull();
  });
});

describe("daily reconciliation", () => {
  it("reports Stripe payments the DB doesn't know as paid, and DB payments without Stripe", async () => {
    const consistent = await paidPayment();
    const slot = await createSlot(doctorId, 40 * 60);
    const unpaidInDb = await createAppointment({ patientId: patient.patient.id, doctorId, scheduleId: slot.id });
    const withoutStripe = await paidPayment({ stripePaymentIntentId: null });
    await prisma.payment.update({ where: { id: withoutStripe.payment.id }, data: { stripePaymentIntentId: null } });
    const missingId = randomUUID();

    stripeState.completedSessions.push(
      { id: "cs_ok", payment_status: "paid", metadata: { paymentId: consistent.payment.id } },
      { id: "cs_unpaid_in_db", payment_status: "paid", metadata: { paymentId: unpaidInDb.payment.id } },
      { id: "cs_missing", payment_status: "paid", metadata: { paymentId: missingId } },
      { id: "cs_no_metadata", payment_status: "paid", metadata: {} },
    );
    const { checked, problems } = await PaymentService.reconcilePayments();
    expect(checked).toBe(4);
    expect(problems.some((p) => p.includes("cs_unpaid_in_db") && p.includes("UNPAID"))).toBe(true);
    expect(problems.some((p) => p.includes(missingId) && p.includes("does not exist"))).toBe(true);
    expect(problems.some((p) => p.includes(withoutStripe.payment.id) && p.includes("no Stripe payment intent"))).toBe(true);
    expect(problems.some((p) => p.includes("cs_ok"))).toBe(false);
  });
});

describe("GET /payments (admin)", () => {
  it("lists payments without raw Stripe data and hides file references", async () => {
    await paidPayment();
    const admin = await createAdmin();
    const res = await api().get(`${API}/payments?limit=50`).set("Cookie", await login(admin.email, admin.password));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain("paymentGatewayData");
    expect(body).not.toContain("payment_intent");
    expect(body).not.toContain("private:");
  });

  it("filters by status", async () => {
    const admin = await createAdmin();
    const res = await api().get(`${API}/payments?status=PAID`).set("Cookie", await login(admin.email, admin.password));
    expect(res.status).toBe(200);
    expect(res.body.data.every((p: { status: string }) => p.status === "PAID")).toBe(true);
  });
});
