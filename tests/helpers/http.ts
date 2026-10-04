import request from "supertest";
import app from "../../src/app";

export const api = () => request(app);
export const API = "/api/v1";

// cookies from a response, as a Cookie header value ("name=value; name=value")
export const cookiesFrom = (res: { headers: Record<string, unknown> }) => {
  const raw = (res.headers["set-cookie"] as string[] | undefined) ?? [];
  return raw
    .map((c) => c.split(";")[0])
    .filter((pair) => !pair.endsWith("=")) // cleared cookies
    .join("; ");
};

export const cookieValue = (cookie: string, name: string) =>
  cookie.split("; ").find((pair) => pair.startsWith(`${name}=`))?.slice(name.length + 1);

// logs in through the real endpoint and returns the Cookie header for later requests
export const login = async (email: string, password: string) => {
  const res = await api().post(`${API}/auth/login`).send({ email, password });
  if (res.status !== 200) {
    throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return cookiesFrom(res);
};
