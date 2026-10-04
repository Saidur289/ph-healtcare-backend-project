// plan.md 11.9: unknown fields are rejected (strict schemas), size limits work, bad JSON -> 400.
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/app/lib/prisma";
import { createDoctor, createPatient, createSlot, TEST_PASSWORD, uniqueEmail } from "./helpers/factories";
import { API, api, login } from "./helpers/http";

let patientCookie: string;
let doctorCookie: string;
let doctorId: string;

beforeAll(async () => {
  const patient = await createPatient();
  const doctor = await createDoctor();
  doctorId = doctor.doctor.id;
  patientCookie = await login(patient.email, patient.password);
  doctorCookie = await login(doctor.email, doctor.password);
});

describe("unknown fields are rejected (.strict())", () => {
  it("register can't choose a role or skip verification", async () => {
    const email = uniqueEmail("strict");
    const res = await api()
      .post(`${API}/auth/register`)
      .send({ name: "Mallory", email, password: TEST_PASSWORD, acceptTerms: true, role: "SUPER_ADMIN", emailVerified: true });
    expect(res.status).toBe(400);
    expect(await prisma.user.count({ where: { email } })).toBe(0);
  });

  it("booking can't name another patient", async () => {
    const slot = await createSlot(doctorId, 24 * 60);
    const res = await api()
      .post(`${API}/appointments/book-appointment`)
      .set("Cookie", patientCookie)
      .send({ doctorId, scheduleId: slot.id, patientId: "someone-else" });
    expect(res.status).toBe(400);
  });

  it("a doctor can't send extra fields in a profile update", async () => {
    const res = await api()
      .patch(`${API}/doctors/${doctorId}`)
      .set("Cookie", doctorCookie)
      .send({ doctor: { designation: "Professor" }, isDeleted: true });
    expect(res.status).toBe(400);
  });

  it("nested objects are strict too", async () => {
    const res = await api()
      .patch(`${API}/doctors/${doctorId}`)
      .set("Cookie", doctorCookie)
      .send({ doctor: { designation: "Professor", averageRating: 5 } });
    expect(res.status).toBe(400);
    expect((await prisma.doctor.findUniqueOrThrow({ where: { id: doctorId } })).averageRating).toBe(0);
  });

  it("a doctor can't change admin-only fields (fee, registration number)", async () => {
    const res = await api()
      .patch(`${API}/doctors/${doctorId}`)
      .set("Cookie", doctorCookie)
      .send({ doctor: { appointmentFee: 1 } });
    expect([400, 403]).toContain(res.status);
    expect((await prisma.doctor.findUniqueOrThrow({ where: { id: doctorId } })).appointmentFee).toBe(1000);
  });

  it("answers 400 with field errors, never 500", async () => {
    const res = await api().post(`${API}/auth/login`).send({ email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(Array.isArray(res.body.errorSources)).toBe(true);
    expect(res.body.errorSources.length).toBeGreaterThan(0);
  });
});

describe("size limits", () => {
  it("JSON bodies over 100 kB -> 413", async () => {
    const res = await api()
      .post(`${API}/auth/login`)
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ email: "a@example.test", password: "x".repeat(110 * 1024) }));
    expect(res.status).toBe(413);
  });

  it("string limits (e.g. cancel reason over 300 characters) -> 400", async () => {
    const res = await api()
      .patch(`${API}/appointments/change-appointment-status/00000000-0000-4000-8000-000000000000`)
      .set("Cookie", patientCookie)
      .send({ status: "CANCELED", reason: "x".repeat(301) });
    expect(res.status).toBe(400);
  });

  it("uploads over 5 MB -> 413", async () => {
    const big = Buffer.alloc(5 * 1024 * 1024 + 10, 0);
    // a real JPEG header, so only the size is wrong
    big.set([0xff, 0xd8, 0xff, 0xe0]);
    const res = await api()
      .patch(`${API}/profile/me`)
      .set("Cookie", patientCookie)
      .attach("profilePhoto", big, { filename: "big.jpg", contentType: "image/jpeg" });
    expect(res.status).toBe(413);
  });

  it("a file whose content does not match its type -> 400", async () => {
    const res = await api()
      .patch(`${API}/profile/me`)
      .set("Cookie", patientCookie)
      .attach("profilePhoto", Buffer.from("<script>alert(1)</script>"), { filename: "photo.jpg", contentType: "image/jpeg" });
    expect(res.status).toBe(400);
  });

  it("an unexpected file field -> 400", async () => {
    const res = await api()
      .patch(`${API}/profile/me`)
      .set("Cookie", patientCookie)
      .attach("somethingElse", Buffer.from([0xff, 0xd8, 0xff, 0xe0]), { filename: "x.jpg", contentType: "image/jpeg" });
    expect(res.status).toBe(400);
  });
});

describe("malformed requests", () => {
  it("bad JSON -> 400 (not 500)", async () => {
    const res = await api().post(`${API}/auth/login`).set("Content-Type", "application/json").send('{"email": "a@example.test",');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not valid JSON/);
  });

  it("a malformed id in the URL -> 4xx (not 500)", async () => {
    const res = await api().get(`${API}/appointments/my-single-appointment/not-a-uuid`).set("Cookie", patientCookie);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it("an unknown route -> 404 JSON", async () => {
    const res = await api().get(`${API}/does-not-exist`);
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it("a cross-site state-changing request is refused (CSRF origin check)", async () => {
    const res = await api().post(`${API}/auth/login`).set("Origin", "https://evil.example").send({ email: "a@example.test", password: "x" });
    expect(res.status).toBe(403);
  });
});
