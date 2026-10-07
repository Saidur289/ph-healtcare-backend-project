// API for the Playwright end-to-end tests (client/tests/e2e). Starts:
//  - a throwaway PostgreSQL (tests/helpers/throwawayPostgres.ts) with all migrations,
//  - the real API (src/app.ts) with the fake, test-only values from tests/test.env,
//  - a local "fakes" server: a tiny Stripe Checkout + Daily.co stand-in, the email outbox and
//    test fixtures. Nothing here talks to the internet, and no real secret is needed.
// Run: npm run e2e:server   (ports: E2E_API_PORT=5055, E2E_FAKES_PORT=5056)
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse } from "dotenv";
import Stripe from "stripe";
import { startThrowawayPostgres } from "../tests/helpers/throwawayPostgres";

const API_PORT = Number(process.env.E2E_API_PORT ?? 5055);
const FAKES_PORT = Number(process.env.E2E_FAKES_PORT ?? 5056);
const FRONTEND_URL = process.env.E2E_FRONTEND_URL ?? "http://localhost:3100";
const FAKES = `http://127.0.0.1:${FAKES_PORT}`;
const OUTBOX = path.join(tmpdir(), `ph-e2e-outbox-${process.pid}.jsonl`);

const testEnv = parse(readFileSync(new URL("../tests/test.env", import.meta.url)));

const main = async () => {
  const db = await startThrowawayPostgres("ph_e2e");
  const env = {
    ...testEnv,
    PORT: String(API_PORT),
    DATABASE_URL: db.databaseUrl,
    FRONTEND_URL,
    BETTER_AUTH_URL: `http://localhost:${API_PORT}`,
    LOG_LEVEL: "warn",
    EMAIL_OUTBOX_FILE: OUTBOX,
    STRIPE_API_BASE: FAKES,
    DAILY_API_URL: `${FAKES}/daily`,
  };
  writeFileSync(OUTBOX, "");
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: { ...process.env, ...env } });
  // the app reads its configuration on import: set it first (dotenv never overrides these)
  Object.assign(process.env, env);

  const { default: app } = await import("../src/app");
  const { seedSuperAdmin } = await import("../src/app/utils/seed");
  const { prisma } = await import("../src/app/lib/prisma");
  const { auth } = await import("../src/app/lib/auth");
  const { AuthService } = await import("../src/app/module/auth/auth.service");
  // fixtures write straight to the database, past the API: clear the public list cache after them
  const { clearResponseCache } = await import("../src/app/utils/responseCache");
  await seedSuperAdmin();
  const apiServer = app.listen(API_PORT);
  const { startJobWorker } = await import("../src/app/utils/jobQueue");
  startJobWorker(1_000);

  // ------------------------------------------------------------ fakes
  const stripe = new Stripe(env.STRIPE_SECRET_KEY);
  type TSession = Record<string, unknown> & { id: string; metadata: Record<string, string>; success_url: string; cancel_url: string; amount_total: number };
  const sessions = new Map<string, TSession>();

  const readBody = (req: IncomingMessage) =>
    new Promise<string>((resolve) => {
      let data = "";
      req.on("data", (chunk) => (data += chunk));
      req.on("end", () => resolve(data));
    });
  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };

  const sendWebhook = async (type: string, object: unknown) => {
    const payload = JSON.stringify({ id: `evt_e2e_${randomUUID()}`, object: "event", type, data: { object }, created: Math.floor(Date.now() / 1000) });
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: env.STRIPE_WEBHOOK_SECRET });
    await fetch(`http://127.0.0.1:${API_PORT}/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "stripe-signature": signature }, body: payload });
  };

  const createUser = async (role: "PATIENT" | "DOCTOR", name: string) => {
    const email = `e2e-${role.toLowerCase()}-${randomUUID().slice(0, 8)}@example.test`;
    const password = "E2e#Password1";
    const { user } = await auth.api.signUpEmail({ body: { name, email, password } });
    await prisma.user.update({ where: { id: user.id }, data: { role, emailVerified: true } });
    return { userId: user.id, email, password };
  };

  const fakes = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", FAKES);
      const route = `${req.method} ${url.pathname}`;
      if (url.pathname.startsWith("/__e2e/fixtures/")) res.on("finish", clearResponseCache);

      // --- Stripe API (form-encoded requests from the stripe library)
      if (route === "POST /v1/checkout/sessions") {
        const form = new URLSearchParams(await readBody(req));
        const id = `cs_e2e_${randomUUID().replace(/-/g, "")}`;
        const session: TSession = {
          id,
          object: "checkout.session",
          status: "open",
          payment_status: "unpaid",
          url: `${FAKES}/checkout/${id}`,
          payment_intent: null,
          amount_total: Number(form.get("line_items[0][price_data][unit_amount]") ?? 0),
          metadata: { paymentId: form.get("metadata[paymentId]") ?? "", appointmentId: form.get("metadata[appointmentId]") ?? "" },
          success_url: form.get("success_url") ?? FRONTEND_URL,
          cancel_url: form.get("cancel_url") ?? FRONTEND_URL,
        };
        sessions.set(id, session);
        return json(res, 200, session);
      }
      const sessionMatch = url.pathname.match(/^\/v1\/checkout\/sessions\/([^/]+)(\/expire)?$/);
      if (sessionMatch) {
        const session = sessions.get(sessionMatch[1]);
        if (!session) return json(res, 404, { error: { type: "invalid_request_error", code: "resource_missing", message: "No such session" } });
        if (sessionMatch[2]) session.status = "expired";
        return json(res, 200, session);
      }
      if (route === "POST /v1/refunds") return json(res, 200, { id: `re_e2e_${randomUUID().slice(0, 8)}`, object: "refund", status: "succeeded" });

      // --- the hosted checkout page the patient is sent to
      const checkout = url.pathname.match(/^\/checkout\/([^/]+)(\/pay)?$/);
      if (checkout) {
        const session = sessions.get(checkout[1]);
        if (!session) return json(res, 404, { message: "Unknown checkout session" });
        if (checkout[2] && req.method === "POST") {
          Object.assign(session, { status: "complete", payment_status: "paid", payment_intent: `pi_e2e_${randomUUID().slice(0, 12)}` });
          await sendWebhook("checkout.session.completed", session);
          res.writeHead(303, { Location: session.success_url });
          return res.end();
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        return res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Test checkout</title></head>
<body><main><h1>Test checkout</h1><p>Amount: BDT ${(session.amount_total / 100).toFixed(0)}</p>
<label>Card number <input name="card" value="4242 4242 4242 4242" readonly></label>
<form method="post" action="/checkout/${session.id}/pay"><button type="submit">Pay</button></form>
<a href="${session.cancel_url}">Cancel</a></main></body></html>`);
      }

      // --- Daily.co API
      if (url.pathname.startsWith("/daily/rooms")) {
        const name = decodeURIComponent(url.pathname.split("/")[3] ?? "") || JSON.parse((await readBody(req)) || "{}").name;
        return json(res, req.method === "GET" && !name ? 404 : 200, { name, url: `${FAKES}/room/${name}` });
      }
      if (route === "POST /daily/meeting-tokens") return json(res, 200, { token: `e2e-token-${randomUUID()}` });
      if (url.pathname.startsWith("/room/")) {
        res.writeHead(200, { "Content-Type": "text/html" });
        return res.end("<!doctype html><title>Test video room</title><p>Test video room</p>");
      }

      // --- test helpers
      if (route === "GET /__e2e/otp") {
        const email = url.searchParams.get("email");
        const lines = readFileSync(OUTBOX, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
        const mail = lines.reverse().find((m) => m.to === email && m.templateName === "otp");
        return mail ? json(res, 200, { otp: mail.templateData.otp }) : json(res, 404, { message: "No code yet" });
      }
      if (route === "POST /__e2e/fixtures/consultation") {
        // a doctor with a PAID appointment that can start now (slot began 1 minute ago)
        const doctorUser = await createUser("DOCTOR", "E2E Doctor");
        const patientUser = await createUser("PATIENT", "E2E Patient");
        const doctor = await prisma.doctor.create({
          data: { userId: doctorUser.userId, name: "E2E Doctor", email: doctorUser.email, registrationNumber: `E2E-${randomUUID().slice(0, 8)}`, gender: "FEMALE", appointmentFee: 800, qualification: "MBBS", designation: "Consultant" },
        });
        const patient = await prisma.patient.create({ data: { userId: patientUser.userId, name: "E2E Patient", email: patientUser.email } });
        const start = new Date(Date.now() - 60_000);
        const schedule = await prisma.schedule.create({ data: { startDateTime: start, endDateTime: new Date(start.getTime() + 30 * 60_000) } });
        await prisma.doctorSchedules.create({ data: { doctorId: doctor.id, scheduleId: schedule.id, isBooked: true } });
        const appointment = await prisma.appointment.create({
          data: { videoCallingId: randomUUID(), patientId: patient.id, doctorId: doctor.id, scheduleId: schedule.id, paymentStatus: "PAID" },
        });
        await prisma.payment.create({
          data: { transactionId: randomUUID(), amount: 800, appointmentId: appointment.id, status: "PAID", paidAt: new Date(), stripePaymentIntentId: `pi_e2e_${randomUUID().slice(0, 12)}` },
        });
        return json(res, 200, { doctor: doctorUser, patient: patientUser, appointmentId: appointment.id });
      }
      if (route === "POST /__e2e/fixtures/doctor-with-slot") {
        // a doctor (fee 1500) offering one free 30-minute slot tomorrow at a fixed UTC time
        const doctorUser = await createUser("DOCTOR", "E2E Booking Doctor");
        const doctor = await prisma.doctor.create({
          data: { userId: doctorUser.userId, name: "E2E Booking Doctor", email: doctorUser.email, registrationNumber: `E2E-${randomUUID().slice(0, 8)}`, gender: "MALE", appointmentFee: 1500, qualification: "MBBS", designation: "Consultant" },
        });
        const start = new Date();
        start.setUTCDate(start.getUTCDate() + 1);
        start.setUTCHours(4, Math.floor(Math.random() * 1000) % 60, 0, 0);
        const schedule = await prisma.schedule.create({ data: { startDateTime: start, endDateTime: new Date(start.getTime() + 30 * 60_000) } });
        await prisma.doctorSchedules.create({ data: { doctorId: doctor.id, scheduleId: schedule.id } });
        return json(res, 200, { doctorId: doctor.id, scheduleId: schedule.id, doctorName: doctor.name });
      }
      if (route === "POST /__e2e/fixtures/google-code") {
        // what a finished Google sign-in leaves behind: a better-auth session and a handoff code
        const patientUser = await createUser("PATIENT", "E2E Google Patient");
        const { token } = await auth.api.signInEmail({ body: { email: patientUser.email, password: patientUser.password } });
        const code = await AuthService.googleLoginSuccess({ user: { id: patientUser.userId }, session: { token } });
        return json(res, 200, { code, email: patientUser.email });
      }
      if (route === "POST /__e2e/fixtures/specialty") {
        const title = `E2E Specialty ${randomUUID().slice(0, 6)}`;
        const specialty = await prisma.specialty.create({ data: { title } });
        return json(res, 200, { id: specialty.id, title });
      }
      if (route === "POST /__e2e/shutdown") {
        json(res, 200, { ok: true });
        setTimeout(() => shutdown(0), 50);
        return;
      }
      json(res, 404, { message: `Fake has no ${route}` });
    } catch (error) {
      console.error("[e2e fakes]", error);
      json(res, 500, { message: (error as Error).message });
    }
  });
  fakes.listen(FAKES_PORT, "127.0.0.1");

  let closing = false;
  const shutdown = (code: number) => {
    if (closing) return;
    closing = true;
    apiServer.close();
    fakes.close();
    db.stop();
    rmSync(OUTBOX, { force: true });
    process.exit(code);
  };
  ["SIGINT", "SIGTERM", "SIGBREAK"].forEach((signal) => process.on(signal, () => shutdown(0)));
  process.on("exit", () => db.stop());

  console.log(`[e2e] API http://localhost:${API_PORT}  fakes ${FAKES}  frontend ${FRONTEND_URL}`);
};

main().catch((error) => {
  console.error("[e2e] failed to start:", error);
  process.exit(1);
});
