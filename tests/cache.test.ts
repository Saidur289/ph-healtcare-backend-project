// plan.md 12.4: the public doctor list and specialties are cached (60 s) and cleared on changes.
import { describe, expect, it } from "vitest";
import { prisma } from "../src/app/lib/prisma";
import { UserStatus } from "../src/generated/prisma/enums";
import { clearResponseCache } from "../src/app/utils/responseCache";
import { createAdmin, createDoctor } from "./helpers/factories";
import { API, api, login } from "./helpers/http";

const listedNames = async () => {
  const res = await api().get(`${API}/doctors?limit=100`);
  expect(res.status).toBe(200);
  return (res.body.data as { name: string }[]).map((d) => d.name);
};

describe("public doctor list cache", () => {
  it("sends Cache-Control for browsers / CDNs", async () => {
    const doctors = await api().get(`${API}/doctors`);
    const specialties = await api().get(`${API}/specialties`);
    for (const res of [doctors, specialties]) {
      expect(res.headers["cache-control"]).toBe("public, max-age=60, stale-while-revalidate=300");
    }
  });

  it("serves repeated requests from the cache, and an API change clears it", async () => {
    const doctor = await createDoctor({ name: "Cached Doctor" });
    expect(await listedNames()).toContain("Cached Doctor");

    // a change that bypasses the API is not visible yet (served from the cache)...
    await prisma.doctor.update({ where: { id: doctor.doctor.id }, data: { name: "Renamed Directly" } });
    expect(await listedNames()).toContain("Cached Doctor");

    // ...a change through the API clears the cache
    const cookie = await login(doctor.email, doctor.password);
    const res = await api().patch(`${API}/doctors/me/availability`).set("Cookie", cookie).send({ isAvailable: false });
    expect(res.status).toBe(200);
    const names = await listedNames();
    expect(names).toContain("Renamed Directly");
    expect(names).not.toContain("Cached Doctor");
  });

  it("different filters are cached separately", async () => {
    await createDoctor({ name: "Filter Doctor Alpha" });
    const all = await api().get(`${API}/doctors?searchTerm=Alpha`);
    const none = await api().get(`${API}/doctors?searchTerm=NoSuchName`);
    expect(all.body.data.length).toBeGreaterThan(0);
    expect(none.body.data).toHaveLength(0);
  });

  it("a failed write does not clear the cache", async () => {
    clearResponseCache();
    const doctor = await createDoctor({ name: "Stable Doctor" });
    expect(await listedNames()).toContain("Stable Doctor");
    await prisma.doctor.update({ where: { id: doctor.doctor.id }, data: { name: "Changed Underneath" } });
    const admin = await createAdmin();
    const bad = await api().delete(`${API}/doctors/00000000-0000-4000-8000-000000000000`).set("Cookie", await login(admin.email, admin.password));
    expect(bad.status).toBe(404);
    expect(await listedNames()).toContain("Stable Doctor");
  });
});

describe("data quality", () => {
  it("blocked doctors are not listed publicly (they can't be booked)", async () => {
    clearResponseCache();
    const blocked = await createDoctor({ name: "Blocked Doctor", status: UserStatus.BLOCKED });
    expect(await listedNames()).not.toContain("Blocked Doctor");
    expect(blocked.doctor.id).toBeTruthy();
  });
});
