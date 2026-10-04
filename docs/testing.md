# Tests

No Docker and no real secrets are needed. Everything runs locally and in CI (`.github/workflows/test.yml`).

## API (this repo) — Vitest + Supertest + a real Postgres

```bash
npm test               # all tests
npm run test:coverage  # + coverage (fails below 80 % lines on the auth, appointment and payment services)
npm run test:types     # type-check the tests
```

- **Database:** `tests/globalSetup.ts` starts a throwaway PostgreSQL on a free port (binaries from
  the `embedded-postgres` dev dependency, run with `initdb`/`pg_ctl`), applies the migrations and
  deletes it afterwards. Every test file starts with empty tables. To use another, empty test
  database set `TEST_DATABASE_URL` (refused unless it is local or its name contains "test").
- **Config:** `tests/test.env` (fake values only). The real `.env` is never used.
- **Fakes** (`tests/setup.ts`, `tests/helpers/mocks.ts`): emails go to an in-memory `outbox`
  (OTP codes are read from it); Stripe network calls are faked, but webhook signatures are made
  and checked with the real Stripe library; Daily.co and the cron timers are stubbed. Rate limits
  are off (`RATE_LIMIT=off`, ignored in production).
- **Data:** `tests/helpers/factories.ts` creates users of every role (real password hashes),
  slots and appointments.

| File | What it proves |
|------|----------------|
| `auth.test.ts` | register → verify → login, lockout, refresh rotation + reuse detection, logout, change / reset password, blocked and unverified users |
| `permissions.test.ts` | every route × every role + anonymous (and that the matrix lists every route), IDOR attempts |
| `booking.test.ts` | 20 parallel bookings → exactly 1, past slot, deleted / blocked doctor, overlaps, unpaid limit, idempotency, Stripe down, pay later, reschedule |
| `state-machine.test.ts` | every status × status × actor, time / payment rules, the HTTP endpoint (slot release, refunds) |
| `payments.test.ts` | webhook signature, duplicate event, late payment → refund, retry after a failure, expired sessions, dashboard refunds |
| `invoices.test.ts` | invoice numbers, PDF + email, retry job, daily reconciliation, admin payment list |
| `cron.test.ts` | only expired unpaid appointments are cancelled, a re-booked slot is kept, two servers at once, reminders sent once |
| `validation.test.ts` | unknown fields → 400, size limits (413), bad JSON → 400, file type checks, CSRF origin check |

## End-to-end (client repo) — Playwright

Run from the client folder (expects this repo next to it as `../server`):

```bash
npm run test:e2e
```

Playwright starts `npm run e2e:server` here (`scripts/e2e-server.ts`): a throwaway Postgres, the
real API with the test config, a local fake **Stripe Checkout** (a test card page that sends a
signed webhook) and **Daily.co**, an email outbox the tests read codes from, and a few fixtures.
`STRIPE_API_BASE`, `DAILY_API_URL` and `EMAIL_OUTBOX_FILE` are what point the API at them
(`STRIPE_API_BASE` and `EMAIL_OUTBOX_FILE` are ignored in production).
