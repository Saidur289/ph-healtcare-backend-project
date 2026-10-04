import Stripe from "stripe";
import { envVars } from "./env";

// STRIPE_API_BASE points the client at a local fake Stripe for the end-to-end tests
// (server/scripts/e2e-server.ts). Ignored in production.
const fakeApiBase =
  envVars.NODE_ENV !== "production" && process.env.STRIPE_API_BASE ? new URL(process.env.STRIPE_API_BASE) : null;

export const stripe = new Stripe(
  envVars.STRIPE.STRIPE_SECRET_KEY,
  fakeApiBase
    ? {
        host: fakeApiBase.hostname,
        port: Number(fakeApiBase.port),
        protocol: fakeApiBase.protocol.replace(":", "") as "http" | "https",
      }
    : undefined,
);
