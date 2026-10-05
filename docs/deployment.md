# Deployment and operations (plan.md phase 13)

No Docker: both apps are deployed as plain Node.js processes (any Node 22+ host: Render, Railway,
Fly.io, a VPS with systemd / pm2, ...). The frontend can also go to Vercel.

## API (this repo)

```bash
npm ci
npm run build           # prisma generate + type-check + bundle -> dist/server.js
npm run migrate:deploy  # apply migrations: a separate release step, BEFORE starting the new version
npm start               # node dist/server.js
```

- **Migrations:** only `prisma migrate deploy` touches a shared database (staging / production).
  Never `migrate dev` or `db push` there. Run it as the host's "release" / pre-deploy command, so a
  failed migration stops the deploy before the new code runs.
- **Config:** every setting is listed in `.env.example`. The server refuses to start with missing or
  weak values in production (short secrets, a test Stripe key, http frontend URL).
- **Behind a proxy / load balancer:** set `TRUST_PROXY=1` (number of hops) so rate limits see the
  real client IP.
- **Templates:** emails read `src/app/templates/*.ejs` from the working directory: deploy the repo
  folder (not only `dist/`).

### Health checks (13.8)

| Endpoint | Meaning | Use as |
|----------|---------|--------|
| `GET /health` | the process is alive | liveness check / uptime monitor |
| `GET /ready` | the database answers (3 s timeout) and the server is not shutting down; otherwise 503 | readiness / load-balancer check |

Both are outside `/api/v1` (no rate limit, not logged).

### Graceful shutdown (13.9)

On `SIGTERM` / `SIGINT` (`src/app/utils/lifecycle.ts`): `/ready` turns 503, the server stops
accepting connections and finishes in-flight requests, the cron jobs stop, the running background
job finishes, queued error reports are sent, the database connection closes, then the process exits.
Anything hanging longer than 10 s forces the exit. Give the host a stop timeout of at least 15 s.

## Frontend (client repo)

- **Vercel:** default `npm run build`; set the env vars from `client/.env.example`.
- **Own server:** `npm run build:standalone`, then `node .next/standalone/server.js`
  (`PORT`, `HOSTNAME=0.0.0.0`). Only the `.next/standalone` folder is needed at runtime.
- `ACCESS_TOKEN_SECRET` must be the same value as the API's.

## Error tracking and alerts (13.10, 13.11)

- **Sentry**, on both apps, only when `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` is set. No cookies,
  auth headers, bodies or query strings are sent; users appear only by id; email addresses are
  masked (`src/app/lib/errorTracking.ts`, `client/src/lib/errorScrub.ts`). The browser sends reports
  through the app itself (`/monitoring`), so the Content-Security-Policy needs no extra host.
- **Alerts:** every alert-worthy event is one error log line with an `alert` field and a Sentry
  report. Create an alert rule on that field in the log platform (or a Sentry alert):

  | `alert` | When |
  |---------|------|
  | `webhook_failed` | a Stripe webhook failed (Stripe retries) |
  | `webhook_unmatched` | a Stripe event matched no payment / was not processed |
  | `payment_mismatch` | the daily reconciliation found Stripe and the DB disagree |
  | `cron_failed` | a background schedule run failed |
  | `job_failed` | a background job (invoice, prescription, email) failed 5 times |
  | `email_failed` | an email could not be sent |

- **Uptime:** point an uptime monitor (UptimeRobot, Better Stack, ...) at `GET /health` of the API
  and at the frontend home page.

## CI (13.5, 13.6)

`.github/workflows/test.yml` in both repos: install → lint → type-check → tests → build, a
production dependency audit (`npm audit --omit=dev --audit-level=high`) and a secret scan of the
whole history (gitleaks; fake test values are allowed in `.gitleaks.toml`). The client also runs the
end-to-end tests. To **block merging** when CI fails: GitHub → Settings → Branches → add a rule for
the main branch → "Require status checks to pass" → select the `ci` jobs.

## Still to set up on the hosting side

- **13.7 Environments:** dev / staging / production, each with its own database (a Neon branch or
  project), Stripe keys + webhook secret, Cloudinary folder, secrets and `DATA_ENCRYPTION_KEY`.
  Deploy staging automatically from the main branch, production manually.
- **13.12 Backups:** Neon keeps point-in-time history (length depends on the plan; set at least 7
  days). Restore once into a new branch, point a staging API at it and check that you can log in
  and see appointments. Keep `DATA_ENCRYPTION_KEY` backed up separately: encrypted columns are
  unreadable without it.
- **13.13 HTTPS:** hosts provide certificates; force HTTPS (redirect HTTP). Set `FRONTEND_URL` and
  `BETTER_AUTH_URL` to the https URLs and point the Stripe webhook at
  `https://<api-host>/webhook` with the events listed in `docs/payments.md`.
