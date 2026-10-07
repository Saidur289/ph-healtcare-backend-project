// plan.md 11.3: register, verify, login, refresh (+ reuse detection), logout,
// change password, reset password, blocked and unverified users.
import { describe, expect, it } from "vitest";
import { prisma } from "../src/app/lib/prisma";
import { UserStatus } from "../src/generated/prisma/enums";
import { createPatient, TEST_PASSWORD, uniqueEmail } from "./helpers/factories";
import { API, api, cookiesFrom, cookieValue, login } from "./helpers/http";
import { waitForOtp } from "./helpers/mocks";

const me = (cookie: string) => api().get(`${API}/auth/me`).set("Cookie", cookie);

describe("register + verify email + login", () => {
  it("creates an unverified patient, refuses login until the OTP is confirmed", async () => {
    const email = uniqueEmail("register");
    const register = await api()
      .post(`${API}/auth/register`)
      .send({ name: "New Patient", email, password: TEST_PASSWORD, acceptTerms: true });
    expect(register.status).toBe(201);
    // never logged in by registering
    expect(register.headers["set-cookie"]).toBeUndefined();

    const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { Patient: true } });
    expect(user.role).toBe("PATIENT");
    expect(user.emailVerified).toBe(false);
    expect(user.Patient).not.toBeNull();
    expect(user.termsVersion).toBeTruthy();

    const early = await api().post(`${API}/auth/login`).send({ email, password: TEST_PASSWORD });
    expect(early.status).toBe(403);

    const otp = await waitForOtp(email);
    const wrong = await api().post(`${API}/auth/verify-email`).send({ email, otp: otp === "000000" ? "111111" : "000000" });
    expect(wrong.status).toBeGreaterThanOrEqual(400);
    expect(wrong.status).toBeLessThan(500);

    const verify = await api().post(`${API}/auth/verify-email`).send({ email, otp });
    expect(verify.status).toBe(200);

    const cookie = await login(email, TEST_PASSWORD);
    expect(cookieValue(cookie, "accessToken")).toBeTruthy();
    expect(cookieValue(cookie, "refreshToken")).toBeTruthy();
    expect(cookieValue(cookie, "better-auth.session_token")).toBeTruthy();
    const profile = await me(cookie);
    expect(profile.status).toBe(200);
    // tokens only in cookies, never in the body
    const loginBody = JSON.stringify((await api().post(`${API}/auth/login`).send({ email, password: TEST_PASSWORD })).body);
    expect(loginBody).not.toContain(cookieValue(cookie, "refreshToken")!);
  });

  it("answers the same for an email that is already registered (no enumeration)", async () => {
    const existing = await createPatient();
    const res = await api()
      .post(`${API}/auth/register`)
      .send({ name: "Someone", email: existing.email, password: TEST_PASSWORD, acceptTerms: true });
    expect(res.status).toBe(201);
    expect(await prisma.user.count({ where: { email: existing.email } })).toBe(1);
  });

  it("requires consent to the terms", async () => {
    const res = await api()
      .post(`${API}/auth/register`)
      .send({ name: "No Consent", email: uniqueEmail(), password: TEST_PASSWORD });
    expect(res.status).toBe(400);
  });
});

describe("login", () => {
  it("rejects a wrong password with 401 and locks after 5 failures", async () => {
    const patient = await createPatient();
    for (let i = 0; i < 4; i++) {
      const res = await api().post(`${API}/auth/login`).send({ email: patient.email, password: "Wrong#Password9" });
      expect(res.status).toBe(401);
    }
    const fifth = await api().post(`${API}/auth/login`).send({ email: patient.email, password: "Wrong#Password9" });
    expect(fifth.status).toBe(429);
    // even the right password is refused while locked
    const locked = await api().post(`${API}/auth/login`).send({ email: patient.email, password: TEST_PASSWORD });
    expect(locked.status).toBe(429);

    // the owner is told once, through the job queue (3.11)
    const jobs = await prisma.job.findMany({ where: { type: "email.send", dedupeKey: { startsWith: `account-locked:${patient.user.id}:` } } });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].payload).toMatchObject({ to: patient.email, templateName: "accountLocked", templateData: { minutes: 15 } });
  });

  it("does not queue a locked-account email for an address that has no account", async () => {
    const email = uniqueEmail("nobody");
    for (let i = 0; i < 5; i++) await api().post(`${API}/auth/login`).send({ email, password: "Wrong#Password9" });
    const jobs = await prisma.job.findMany({ where: { type: "email.send" } });
    expect(jobs.some((job) => (job.payload as { to?: string }).to === email)).toBe(false);
  });

  it("rejects a blocked user and leaves no session behind", async () => {
    const patient = await createPatient({ status: UserStatus.BLOCKED });
    const res = await api().post(`${API}/auth/login`).send({ email: patient.email, password: TEST_PASSWORD });
    expect(res.status).toBe(403);
    expect(await prisma.session.count({ where: { userId: patient.user.id } })).toBe(0);
  });

  it("rejects an unverified user", async () => {
    const patient = await createPatient({ verified: false });
    const res = await api().post(`${API}/auth/login`).send({ email: patient.email, password: TEST_PASSWORD });
    expect(res.status).toBe(403);
  });
});

describe("protected requests", () => {
  it("rejects missing, tampered and foreign tokens with 401", async () => {
    const a = await createPatient();
    const b = await createPatient();
    const cookieA = await login(a.email, a.password);
    const cookieB = await login(b.email, b.password);

    expect((await api().get(`${API}/profile/me`)).status).toBe(401);
    const tampered = cookieA.replace(/accessToken=([^;]+)/, (_m, t: string) => `accessToken=${t.slice(0, -2)}xx`);
    expect((await api().get(`${API}/profile/me`).set("Cookie", tampered)).status).toBe(401);
    // A's session with B's access token
    const mixed = `better-auth.session_token=${cookieValue(cookieA, "better-auth.session_token")}; accessToken=${cookieValue(cookieB, "accessToken")}`;
    expect((await api().get(`${API}/profile/me`).set("Cookie", mixed)).status).toBe(401);
  });

  it("blocks a user whose account is blocked after login (403), on every request", async () => {
    const patient = await createPatient();
    const cookie = await login(patient.email, patient.password);
    expect((await api().get(`${API}/profile/me`).set("Cookie", cookie)).status).toBe(200);
    await prisma.user.update({ where: { id: patient.user.id }, data: { status: UserStatus.BLOCKED } });
    expect((await api().get(`${API}/profile/me`).set("Cookie", cookie)).status).toBe(403);
    // and the refresh token can't be used to get new tokens
    expect((await api().post(`${API}/auth/refresh-token`).set("Cookie", cookie)).status).toBe(403);
  });

  it("an unverified user reaches /auth/me but no other protected route", async () => {
    const patient = await createPatient();
    const cookie = await login(patient.email, patient.password);
    await prisma.user.update({ where: { id: patient.user.id }, data: { emailVerified: false } });
    expect((await me(cookie)).status).toBe(200);
    expect((await api().get(`${API}/profile/me`).set("Cookie", cookie)).status).toBe(403);
  });

  it("rejects an expired session", async () => {
    const patient = await createPatient();
    const cookie = await login(patient.email, patient.password);
    await prisma.session.updateMany({ where: { userId: patient.user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await me(cookie)).status).toBe(401);
    expect((await api().post(`${API}/auth/refresh-token`).set("Cookie", cookie)).status).toBe(401);
  });
});

describe("refresh tokens", () => {
  it("rotates the refresh token", async () => {
    const patient = await createPatient();
    const cookie = await login(patient.email, patient.password);
    const res = await api().post(`${API}/auth/refresh-token`).set("Cookie", cookie);
    expect(res.status).toBe(200);
    const fresh = cookiesFrom(res);
    expect(cookieValue(fresh, "refreshToken")).toBeTruthy();
    expect(cookieValue(fresh, "refreshToken")).not.toBe(cookieValue(cookie, "refreshToken"));
    expect((await me(fresh)).status).toBe(200);
  });

  it("detects reuse of an old refresh token and ends every session of the user", async () => {
    const patient = await createPatient();
    const stolen = await login(patient.email, patient.password);
    const otherDevice = await login(patient.email, patient.password);
    const rotated = await api().post(`${API}/auth/refresh-token`).set("Cookie", stolen);
    expect(rotated.status).toBe(200);

    // two tabs refreshing at the same moment: refused, but nobody is logged out
    expect((await api().post(`${API}/auth/refresh-token`).set("Cookie", stolen)).status).toBe(401);
    expect(await prisma.session.count({ where: { userId: patient.user.id } })).toBe(2);

    // later, the old token comes back: treated as stolen
    const sessionId = (await prisma.session.findFirstOrThrow({ where: { token: cookieValue(stolen, "better-auth.session_token") } })).id;
    await prisma.session.update({ where: { id: sessionId }, data: { updatedAt: new Date(Date.now() - 60_000) } });
    expect((await api().post(`${API}/auth/refresh-token`).set("Cookie", stolen)).status).toBe(401);
    expect(await prisma.session.count({ where: { userId: patient.user.id } })).toBe(0);
    expect((await me(otherDevice)).status).toBe(401);
  });

  it("needs a refresh token cookie", async () => {
    expect((await api().post(`${API}/auth/refresh-token`)).status).toBe(401);
  });
});

describe("logout", () => {
  it("deletes the session and clears the cookies", async () => {
    const patient = await createPatient();
    const cookie = await login(patient.email, patient.password);
    const res = await api().post(`${API}/auth/logout`).set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect((res.headers["set-cookie"] as unknown as string[]).join(";")).toMatch(/accessToken=;/);
    expect((await me(cookie)).status).toBe(401);
    expect(await prisma.auditLog.count({ where: { action: "auth.logout", actorId: patient.user.id } })).toBe(1);
  });

  it("works without a session", async () => {
    expect((await api().post(`${API}/auth/logout`)).status).toBe(200);
  });
});

describe("change password", () => {
  it("changes the password and logs out the other devices", async () => {
    const patient = await createPatient();
    const cookie = await login(patient.email, patient.password);
    const other = await login(patient.email, patient.password);
    const newPassword = "Changed#Password2";

    const wrong = await api()
      .post(`${API}/auth/change-password`)
      .set("Cookie", cookie)
      .send({ currentPassword: "Not#ThePassword1", newPassword });
    expect(wrong.status).toBeGreaterThanOrEqual(400);
    expect(wrong.status).toBeLessThan(500);

    const res = await api()
      .post(`${API}/auth/change-password`)
      .set("Cookie", cookie)
      .send({ currentPassword: TEST_PASSWORD, newPassword });
    expect(res.status).toBe(200);
    expect((await me(cookiesFrom(res))).status).toBe(200);
    expect((await me(other)).status).toBe(401);

    expect((await api().post(`${API}/auth/login`).send({ email: patient.email, password: TEST_PASSWORD })).status).toBe(401);
    await login(patient.email, newPassword);
  });
});

describe("reset password", () => {
  it("resets with the emailed code and ends every session", async () => {
    const patient = await createPatient();
    const cookie = await login(patient.email, patient.password);
    const forgot = await api().post(`${API}/auth/forget-password`).send({ email: patient.email });
    expect(forgot.status).toBe(200);
    const otp = await waitForOtp(patient.email);

    const newPassword = "Reset#Password3";
    const res = await api().post(`${API}/auth/reset-password`).send({ email: patient.email, otp, newPassword });
    expect(res.status).toBe(200);
    expect((await me(cookie)).status).toBe(401);
    await login(patient.email, newPassword);
  });

  it("answers the same for an unknown email", async () => {
    const res = await api().post(`${API}/auth/forget-password`).send({ email: uniqueEmail("nobody") });
    expect(res.status).toBe(200);
  });

  it("refuses a wrong code", async () => {
    const patient = await createPatient();
    await api().post(`${API}/auth/forget-password`).send({ email: patient.email });
    const otp = await waitForOtp(patient.email);
    const res = await api()
      .post(`${API}/auth/reset-password`)
      .send({ email: patient.email, otp: otp === "123456" ? "654321" : "123456", newPassword: "Reset#Password3" });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    await login(patient.email, TEST_PASSWORD);
  });
});
