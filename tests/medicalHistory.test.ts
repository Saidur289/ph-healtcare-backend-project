// A doctor may read a patient's medical history (health data + reports) only through one of
// their own upcoming / in-progress / completed appointments; every read is audited.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/app/lib/prisma";
import { AppointmentStatus, PaymentStatus } from "../src/generated/prisma/enums";
import { encryptHealthData, encryptReportName } from "../src/app/utils/healthCrypto";
import { createAppointment, createDoctor, createPatient, createSlot } from "./helpers/factories";
import { API, api, login } from "./helpers/http";

vi.mock("../src/app/config/privateFiles", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/app/config/privateFiles")>()),
  signedFileUrl: vi.fn(() => "https://files.test/signed-report"),
}));

let patient: Awaited<ReturnType<typeof createPatient>>;
let doctor: Awaited<ReturnType<typeof createDoctor>>;
let doctorCookie: string;
let reportId: string;

beforeAll(async () => {
  patient = await createPatient();
  doctor = await createDoctor();
  doctorCookie = await login(doctor.email, doctor.password);
  await prisma.patientHealthData.create({
    data: {
      patientId: patient.patient.id,
      ...encryptHealthData({
        gender: "FEMALE" as const,
        dateOfBirth: new Date("1990-05-01"),
        bloodGroup: "O_POSITIVE" as const,
        height: "165 cm",
        weight: "60 kg",
        hasAllergies: true,
        mentalHealthHistory: "Mild anxiety 2024",
      }),
    },
  });
  reportId = (
    await prisma.medicalReport.create({
      data: { patientId: patient.patient.id, reportName: encryptReportName("blood-test.pdf"), reportLink: "private:raw:ph-healthcare/private/medicalReports/x:pdf" },
    })
  ).id;
});

const appointmentWith = async (doctorId: string, status: AppointmentStatus) => {
  const slot = await createSlot(doctorId, status === AppointmentStatus.COMPLETED ? -24 * 60 : 24 * 60);
  return (await createAppointment({ patientId: patient.patient.id, doctorId, scheduleId: slot.id, status, paymentStatus: PaymentStatus.PAID })).appointment;
};
const history = (cookie: string, appointmentId: string) => api().get(`${API}/appointments/${appointmentId}/medical-history`).set("Cookie", cookie);

describe("GET /appointments/:id/medical-history", () => {
  it("the treating doctor gets the decrypted history, never file locations, and the read is audited", async () => {
    const appointment = await appointmentWith(doctor.doctor.id, AppointmentStatus.SCHEDULED);
    const res = await history(doctorCookie, appointment.id);
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    const body = JSON.stringify(res.body);
    expect(res.body.data.healthData.bloodGroup).toBe("O_POSITIVE");
    expect(res.body.data.healthData.mentalHealthHistory).toBe("Mild anxiety 2024");
    expect(res.body.data.reports).toEqual([expect.objectContaining({ id: reportId, reportName: "blood-test.pdf", hasFile: true })]);
    expect(body).not.toContain("enc:v1");
    expect(body).not.toContain("private:");
    expect(await prisma.auditLog.count({ where: { action: "patient.medical_history_read", actorId: doctor.user.id, entityId: patient.patient.id } })).toBe(1);
  });

  it("also works for a completed consultation", async () => {
    const appointment = await appointmentWith(doctor.doctor.id, AppointmentStatus.COMPLETED);
    expect((await history(doctorCookie, appointment.id)).status).toBe(200);
  });

  it("not through a cancelled appointment (404)", async () => {
    const appointment = await appointmentWith(doctor.doctor.id, AppointmentStatus.CANCELED);
    expect((await history(doctorCookie, appointment.id)).status).toBe(404);
  });

  it("another doctor gets 404 (not 403: the appointment's existence is not confirmed)", async () => {
    const appointment = await appointmentWith(doctor.doctor.id, AppointmentStatus.SCHEDULED);
    const other = await createDoctor();
    expect((await history(await login(other.email, other.password), appointment.id)).status).toBe(404);
    expect(await prisma.auditLog.count({ where: { action: "patient.medical_history_read", actorId: other.user.id } })).toBe(0);
  });

  it("patients use their own pages (403 here)", async () => {
    const appointment = await appointmentWith(doctor.doctor.id, AppointmentStatus.SCHEDULED);
    expect((await history(await login(patient.email, patient.password), appointment.id)).status).toBe(403);
  });
});

describe("report files for doctors", () => {
  it("the treating doctor can open the patient's report (signed link, audited)", async () => {
    const res = await api().get(`${API}/files/reports/${reportId}`).set("Cookie", doctorCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.url).toBe("https://files.test/signed-report");
    expect(await prisma.auditLog.count({ where: { action: "file.read", actorId: doctor.user.id, entityId: reportId } })).toBe(1);
  });

  it("a doctor without an appointment with the patient gets 404", async () => {
    const other = await createDoctor();
    expect((await api().get(`${API}/files/reports/${reportId}`).set("Cookie", await login(other.email, other.password))).status).toBe(404);
  });

  it("a doctor whose only appointment was cancelled gets 404", async () => {
    const other = await createDoctor();
    await appointmentWith(other.doctor.id, AppointmentStatus.CANCELED);
    expect((await api().get(`${API}/files/reports/${reportId}`).set("Cookie", await login(other.email, other.password))).status).toBe(404);
  });
});
