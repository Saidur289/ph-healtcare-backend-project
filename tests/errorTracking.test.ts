// plan.md 13.10 / 10.8: error reports never carry personal data.
import type { ErrorEvent } from "@sentry/node";
import { describe, expect, it } from "vitest";
import { scrubEvent } from "../src/app/lib/errorTracking";

describe("scrubEvent", () => {
  it("removes cookies, auth headers, bodies, query strings and personal fields", () => {
    const event = scrubEvent({
      type: undefined,
      message: "Login failed for rahim@example.test",
      request: {
        method: "POST",
        url: "https://api.example.test/api/v1/auth/login?email=rahim@example.test",
        headers: { cookie: "accessToken=abc", authorization: "Bearer abc", "user-agent": "Mozilla", "x-request-id": "req-1" },
        cookies: { accessToken: "abc" },
        data: { email: "rahim@example.test", password: "secret" },
        query_string: "email=rahim@example.test",
      },
      user: { id: "user-1", email: "rahim@example.test", ip_address: "1.2.3.4", username: "rahim" },
      exception: { values: [{ type: "Error", value: "No user rahim@example.test" }] },
      extra: { contactNumber: "01700000000", patient: { name: "Rahim", note: "call rahim@example.test" }, statusCode: 500 },
      breadcrumbs: [{ message: "sent to rahim@example.test", data: { email: "rahim@example.test", path: "/x" } }],
    } as ErrorEvent);

    const text = JSON.stringify(event);
    for (const secret of ["rahim@example.test", "accessToken", "Bearer", "secret", "01700000000", "1.2.3.4", "Rahim"]) {
      expect(text, secret).not.toContain(secret);
    }
    expect(event.request).toEqual({
      method: "POST",
      url: "https://api.example.test/api/v1/auth/login",
      headers: { "user-agent": "Mozilla", "x-request-id": "req-1" },
    });
    expect(event.user).toEqual({ id: "user-1" });
    expect(event.message).toBe("Login failed for [email]");
    expect(event.extra?.statusCode).toBe(500);
  });
});
