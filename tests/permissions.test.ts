// plan.md 11.4: one test per row of the permission matrix (docs/permissions.md), for every
// role + anonymous, plus IDOR attempts (someone else's records).
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/app/lib/prisma";
import { AppointmentStatus, PaymentStatus } from "../src/generated/prisma/enums";
import { createAdmin, createAppointment, createDoctor, createPatient, createSlot, createSuperAdmin } from "./helpers/factories";
import { API, api, login } from "./helpers/http";

type TRole = "PATIENT" | "DOCTOR" | "ADMIN" | "SUPER_ADMIN";
type TAccess = TRole[] | "PUBLIC" | "ANY";
type TRow = { method: "get" | "post" | "patch" | "put" | "delete"; path: string; access: TAccess; skipCall?: string; anonymousStatus?: number };

const ALL: TRole[] = ["PATIENT", "DOCTOR", "ADMIN", "SUPER_ADMIN"];
const ADMINS: TRole[] = ["ADMIN", "SUPER_ADMIN"];
const ID = randomUUID();

// Keep in sync with the route files: the "covers every route" test below fails when a route is missing.
const MATRIX: Record<string, TRow[]> = {
  auth: [
    { method: "post", path: "/auth/register", access: "PUBLIC" },
    { method: "post", path: "/auth/login", access: "PUBLIC" },
    { method: "get", path: "/auth/me", access: "ANY" },
    { method: "post", path: "/auth/refresh-token", access: "PUBLIC", anonymousStatus: 401 }, // public, but needs the refresh cookie
    { method: "post", path: "/auth/logout", access: "PUBLIC", skipCall: "would end the shared test sessions" },
    { method: "post", path: "/auth/change-password", access: "ANY" },
    { method: "post", path: "/auth/verify-email", access: "PUBLIC" },
    { method: "post", path: "/auth/resend-verification-otp", access: "PUBLIC" },
    { method: "post", path: "/auth/forget-password", access: "PUBLIC" },
    { method: "post", path: "/auth/reset-password", access: "PUBLIC" },
    { method: "get", path: "/auth/login/google", access: "PUBLIC", skipCall: "redirects to Google" },
    { method: "get", path: "/auth/google/success", access: "PUBLIC", skipCall: "Google callback" },
    { method: "post", path: "/auth/google/exchange", access: "PUBLIC" },
    { method: "get", path: "/auth/oauth/error", access: "PUBLIC", skipCall: "Google callback" },
  ],
  user: [
    { method: "post", path: "/users/create-doctor", access: ADMINS },
    { method: "post", path: "/users/create-admin", access: ["SUPER_ADMIN"] },
  ],
  specialty: [
    { method: "post", path: "/specialties", access: ADMINS },
    { method: "get", path: "/specialties", access: "PUBLIC" },
    { method: "patch", path: `/specialties/${ID}`, access: ADMINS },
    { method: "delete", path: `/specialties/${ID}`, access: ADMINS },
  ],
  doctor: [
    { method: "get", path: "/doctors/admin", access: ADMINS },
    { method: "get", path: `/doctors/admin/${ID}`, access: ADMINS },
    { method: "patch", path: "/doctors/me/availability", access: ["DOCTOR"] },
    { method: "get", path: "/doctors", access: "PUBLIC" },
    { method: "get", path: `/doctors/${ID}`, access: "PUBLIC" },
    { method: "get", path: `/doctors/${ID}/available-slots`, access: "PUBLIC" },
    { method: "patch", path: `/doctors/${ID}`, access: ["ADMIN", "DOCTOR", "SUPER_ADMIN"] },
    { method: "delete", path: `/doctors/${ID}`, access: ADMINS },
  ],
  admin: [
    { method: "patch", path: "/admins/change-user-status", access: ADMINS },
    { method: "patch", path: "/admins/change-user-role", access: ["SUPER_ADMIN"] },
    { method: "get", path: "/admins", access: ADMINS },
    { method: "get", path: `/admins/${ID}`, access: ADMINS },
    { method: "patch", path: `/admins/${ID}`, access: ["SUPER_ADMIN"] },
    { method: "delete", path: `/admins/${ID}`, access: ["SUPER_ADMIN"] },
  ],
  schedule: [
    { method: "post", path: "/schedules", access: ADMINS },
    { method: "get", path: "/schedules", access: ["ADMIN", "SUPER_ADMIN", "DOCTOR"] },
    { method: "get", path: `/schedules/${ID}`, access: ["ADMIN", "SUPER_ADMIN", "DOCTOR"] },
    { method: "patch", path: `/schedules/${ID}`, access: ADMINS },
    { method: "delete", path: `/schedules/${ID}`, access: ADMINS },
  ],
  doctorSchedule: [
    { method: "post", path: "/doctor-schedules/create-my-doctor-schedule", access: ["DOCTOR"] },
    { method: "get", path: "/doctor-schedules/my-doctor-schedules", access: ["DOCTOR"] },
    { method: "get", path: "/doctor-schedules", access: ADMINS },
    { method: "get", path: `/doctor-schedules/${ID}/schedule/${ID}`, access: ADMINS },
    { method: "patch", path: "/doctor-schedules/update-doctor-schedule", access: ["DOCTOR"] },
    { method: "delete", path: `/doctor-schedules/delete-my-schedule/${ID}`, access: ["DOCTOR"] },
  ],
  appointment: [
    { method: "get", path: "/appointments", access: ADMINS },
    { method: "post", path: "/appointments/book-appointment", access: ["PATIENT"] },
    { method: "get", path: "/appointments/my-appointments", access: ["PATIENT", "DOCTOR"] },
    { method: "get", path: `/appointments/my-single-appointment/${ID}`, access: ["PATIENT", "DOCTOR"] },
    { method: "patch", path: `/appointments/change-appointment-status/${ID}`, access: ["DOCTOR", "PATIENT", "ADMIN", "SUPER_ADMIN"] },
    { method: "post", path: "/appointments/book-appointment-with-pay-later", access: ["PATIENT"] },
    { method: "get", path: `/appointments/${ID}/medical-history`, access: ["DOCTOR"] },
    { method: "get", path: `/appointments/${ID}/join`, access: ["PATIENT", "DOCTOR"] },
    { method: "patch", path: `/appointments/reschedule/${ID}`, access: ["PATIENT"] },
    { method: "post", path: `/appointments/initiate-payment/${ID}`, access: ["PATIENT"] },
  ],
  patient: [
    { method: "get", path: "/patients", access: ADMINS },
    { method: "patch", path: "/patients/update-profile", access: ["PATIENT"] },
  ],
  review: [
    { method: "post", path: "/reviews", access: ["PATIENT"] },
    { method: "get", path: "/reviews/my-reviews", access: ["PATIENT", "DOCTOR"] },
    { method: "get", path: "/reviews", access: ADMINS },
    { method: "patch", path: `/reviews/${ID}/visibility`, access: ADMINS },
    { method: "patch", path: `/reviews/update-review/${ID}`, access: ["PATIENT"] },
    { method: "delete", path: `/reviews/delete-review/${ID}`, access: ["PATIENT"] },
  ],
  prescription: [
    { method: "get", path: "/prescriptions", access: ADMINS },
    { method: "post", path: "/prescriptions", access: ["DOCTOR"] },
    { method: "get", path: "/prescriptions/my-prescriptions", access: ["DOCTOR", "PATIENT"] },
    { method: "put", path: `/prescriptions/${ID}`, access: ["DOCTOR"] },
    { method: "delete", path: `/prescriptions/${ID}`, access: ["DOCTOR"] },
  ],
  stats: [{ method: "get", path: "/stats", access: ALL }],
  profile: [
    { method: "get", path: "/profile/me", access: ALL },
    { method: "patch", path: "/profile/me", access: ALL },
    { method: "get", path: "/profile/me/export", access: ["PATIENT"] },
    { method: "delete", path: "/profile/me", access: ["PATIENT"] },
  ],
  payment: [{ method: "get", path: "/payments", access: ADMINS }],
  files: [
    { method: "get", path: `/files/reports/${ID}`, access: ["PATIENT", "DOCTOR"] },
    { method: "get", path: `/files/prescriptions/${ID}`, access: ["PATIENT", "DOCTOR"] },
    { method: "get", path: `/files/invoices/${ID}`, access: ["PATIENT", "ADMIN", "SUPER_ADMIN"] },
  ],
};

// messages that only checkAuth produces (a business 401/403 from a service is fine for an allowed role)
const isAuthGate401 = (res: { status: number; body: { message?: string } }) =>
  res.status === 401 && /^(Unauthorized|Session expired)/.test(res.body?.message ?? "");
const isRoleGate403 = (res: { status: number; body: { message?: string } }) =>
  res.status === 403 && /^Forbidden - you do not have access/.test(res.body?.message ?? "");

const cookies = {} as Record<TRole, string>;

beforeAll(async () => {
  const users = {
    PATIENT: await createPatient(),
    DOCTOR: await createDoctor(),
    ADMIN: await createAdmin(),
    SUPER_ADMIN: await createSuperAdmin(),
  };
  for (const role of ALL) cookies[role] = await login(users[role].email, users[role].password);
});

const call = (row: TRow, cookie?: string) => {
  const req = api()[row.method](`${API}${row.path}`);
  if (cookie) req.set("Cookie", cookie);
  return row.method === "get" || row.method === "delete" ? req.send() : req.send({});
};

describe("permission matrix", () => {
  it("covers every route registered in the route files", () => {
    for (const [module, rows] of Object.entries(MATRIX)) {
      const source = readFileSync(`src/app/module/${module}/${module}.route.ts`, "utf8");
      const registered = source.match(/router\.(get|post|patch|put|delete)\(/g)?.length ?? 0;
      expect(rows.length, `${module}.route.ts has ${registered} routes, the matrix lists ${rows.length}`).toBe(registered);
    }
  });

  for (const [module, rows] of Object.entries(MATRIX)) {
    describe(module, () => {
      for (const row of rows) {
        const label = `${row.method.toUpperCase()} ${row.path.replaceAll(ID, ":id")}`;
        if (row.skipCall) {
          it.skip(`${label} (${row.skipCall})`, () => undefined);
          continue;
        }
        it(label, async () => {
          const anonymous = await call(row);
          if (row.anonymousStatus) {
            expect(anonymous.status, `anonymous ${label}`).toBe(row.anonymousStatus);
          } else if (row.access === "PUBLIC") {
            expect([401, 403], `anonymous ${label}`).not.toContain(anonymous.status);
          } else {
            expect(anonymous.status, `anonymous ${label}`).toBe(401);
          }
          if (row.access === "PUBLIC") return;
          for (const role of ALL) {
            const allowed = row.access === "ANY" || row.access.includes(role);
            const res = await call(row, cookies[role]);
            expect(isAuthGate401(res), `${role} ${label} got ${res.status} ${res.body?.message}`).toBe(false);
            expect(isRoleGate403(res), `${role} ${label} got ${res.status} ${res.body?.message}`).toBe(!allowed);
          }
        });
      }
    });
  }
});

describe("IDOR: someone else's records", () => {
  let other: { patient: string; doctor: string };
  let ids: { appointment: string; payment: string; report: string; prescription: string; review: string; doctorA: string; schedule: string };

  beforeAll(async () => {
    const patientA = await createPatient();
    const doctorA = await createDoctor();
    const patientB = await createPatient();
    const doctorB = await createDoctor();
    other = { patient: await login(patientB.email, patientB.password), doctor: await login(doctorB.email, doctorB.password) };

    const slot = await createSlot(doctorA.doctor.id, 24 * 60);
    const moveTo = await createSlot(doctorA.doctor.id, 26 * 60);
    const { appointment, payment } = await createAppointment({
      patientId: patientA.patient.id,
      doctorId: doctorA.doctor.id,
      scheduleId: slot.id,
      status: AppointmentStatus.COMPLETED,
      paymentStatus: PaymentStatus.PAID,
    });
    const report = await prisma.medicalReport.create({
      data: { patientId: patientA.patient.id, reportName: "blood.pdf", reportLink: "private:raw:ph-healthcare/private/test/x:pdf" },
    });
    const prescription = await prisma.prescription.create({
      data: { appointmentId: appointment.id, patientId: patientA.patient.id, doctorId: doctorA.doctor.id, followUpDate: new Date(), instructions: "Rest" },
    });
    const review = await prisma.review.create({
      data: { appointmentId: appointment.id, patientId: patientA.patient.id, doctorId: doctorA.doctor.id, rating: 5 },
    });
    ids = { appointment: appointment.id, payment: payment.id, report: report.id, prescription: prescription.id, review: review.id, doctorA: doctorA.doctor.id, schedule: moveTo.id };
  });

  it("another patient can't read, change, pay, join or reschedule the appointment", async () => {
    const p = other.patient;
    expect((await api().get(`${API}/appointments/my-single-appointment/${ids.appointment}`).set("Cookie", p)).status).toBe(404);
    expect((await api().patch(`${API}/appointments/change-appointment-status/${ids.appointment}`).set("Cookie", p).send({ status: "CANCELED" })).status).toBe(404);
    expect((await api().post(`${API}/appointments/initiate-payment/${ids.appointment}`).set("Cookie", p)).status).toBe(404);
    expect((await api().get(`${API}/appointments/${ids.appointment}/join`).set("Cookie", p)).status).toBe(404);
    expect((await api().patch(`${API}/appointments/reschedule/${ids.appointment}`).set("Cookie", p).send({ scheduleId: ids.schedule })).status).toBe(404);
  });

  it("another doctor can't change the appointment or another doctor's profile", async () => {
    const d = other.doctor;
    expect((await api().patch(`${API}/appointments/change-appointment-status/${ids.appointment}`).set("Cookie", d).send({ status: "NO_SHOW" })).status).toBe(404);
    expect((await api().get(`${API}/appointments/my-single-appointment/${ids.appointment}`).set("Cookie", d)).status).toBe(404);
    expect((await api().patch(`${API}/doctors/${ids.doctorA}`).set("Cookie", d).send({ doctor: { designation: "Hacked" } })).status).toBe(403);
    expect((await prisma.doctor.findUniqueOrThrow({ where: { id: ids.doctorA } })).designation).toBe("Consultant");
  });

  it("files of another patient are not found (404, existence not confirmed)", async () => {
    expect((await api().get(`${API}/files/reports/${ids.report}`).set("Cookie", other.patient)).status).toBe(404);
    expect((await api().get(`${API}/files/invoices/${ids.payment}`).set("Cookie", other.patient)).status).toBe(404);
    expect((await api().get(`${API}/files/prescriptions/${ids.prescription}`).set("Cookie", other.patient)).status).toBe(404);
    expect((await api().get(`${API}/files/prescriptions/${ids.prescription}`).set("Cookie", other.doctor)).status).toBe(404);
  });

  it("another doctor can't edit or delete the prescription", async () => {
    const d = other.doctor;
    const put = await api().put(`${API}/prescriptions/${ids.prescription}`).set("Cookie", d).send({ instructions: "Changed" });
    expect([403, 404]).toContain(put.status);
    expect([403, 404]).toContain((await api().delete(`${API}/prescriptions/${ids.prescription}`).set("Cookie", d)).status);
    expect(await prisma.prescription.count({ where: { id: ids.prescription } })).toBe(1);
  });

  it("another patient can't edit or delete the review", async () => {
    const p = other.patient;
    expect([403, 404]).toContain((await api().patch(`${API}/reviews/update-review/${ids.review}`).set("Cookie", p).send({ rating: 1 })).status);
    expect([403, 404]).toContain((await api().delete(`${API}/reviews/delete-review/${ids.review}`).set("Cookie", p)).status);
    expect((await prisma.review.findUniqueOrThrow({ where: { id: ids.review } })).rating).toBe(5);
  });

  it("lists only return the caller's own records", async () => {
    const res = await api().get(`${API}/appointments/my-appointments`).set("Cookie", other.patient);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain(ids.appointment);
    const prescriptions = await api().get(`${API}/prescriptions/my-prescriptions`).set("Cookie", other.doctor);
    expect(JSON.stringify(prescriptions.body)).not.toContain(ids.prescription);
  });
});
