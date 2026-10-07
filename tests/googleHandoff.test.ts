// Google sign-in handoff: the API gives the frontend a single-use, 60-second code instead of
// cookies on its own domain; the Next.js server exchanges it for the auth cookies.
import { describe, expect, it } from "vitest";
import { prisma } from "../src/app/lib/prisma";
import { AuthService } from "../src/app/module/auth/auth.service";
import { UserStatus } from "../src/generated/prisma/enums";
import { createPatient } from "./helpers/factories";
import { API, api, cookiesFrom, cookieValue, login } from "./helpers/http";

// a real better-auth session, as Google sign-in would leave behind
const googleCode = async (options: Parameters<typeof createPatient>[0] = {}) => {
  const patient = await createPatient(options);
  const cookie = await login(patient.email, patient.password);
  const sessionToken = decodeURIComponent(cookieValue(cookie, "better-auth.session_token") ?? "").split(".")[0];
  const code = await AuthService.googleLoginSuccess({ user: { id: patient.user.id }, session: { token: sessionToken } });
  return { patient, code };
};
const exchange = (code: string) => api().post(`${API}/auth/google/exchange`).send({ code });

describe("Google sign-in code exchange", () => {
  it("returns the auth cookies and the user once, and stores only a hash of the code", async () => {
    const { patient, code } = await googleCode();
    expect(await prisma.verification.count({ where: { value: code } })).toBe(0);
    expect(await prisma.verification.count({ where: { identifier: { contains: code } } })).toBe(0);

    const res = await exchange(code);
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(patient.email);
    const cookie = cookiesFrom(res);
    expect(cookieValue(cookie, "accessToken")).toBeTruthy();
    expect(cookieValue(cookie, "refreshToken")).toBeTruthy();
    // the cookies work
    expect((await api().get(`${API}/auth/me`).set("Cookie", cookie)).status).toBe(200);

    // single use
    expect((await exchange(code)).status).toBe(401);
  });

  it("refuses an expired code", async () => {
    const { code } = await googleCode();
    await prisma.verification.updateMany({ where: { identifier: { startsWith: "google-handoff:" } }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await exchange(code)).status).toBe(401);
  });

  it("refuses a code for an account that was blocked in the meantime", async () => {
    const { patient, code } = await googleCode();
    await prisma.user.update({ where: { id: patient.user.id }, data: { status: UserStatus.BLOCKED } });
    const res = await exchange(code);
    expect(res.status).toBeGreaterThanOrEqual(401);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("rejects unknown and malformed codes", async () => {
    expect((await exchange("A".repeat(43))).status).toBe(401);
    expect((await exchange("not a code")).status).toBe(400);
    expect((await api().post(`${API}/auth/google/exchange`).send({})).status).toBe(400);
  });
});
