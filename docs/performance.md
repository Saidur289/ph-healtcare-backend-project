# Performance and data quality (plan.md phase 12)

## Indexes (12.1)

Composite indexes for how appointments are really queried: `(patientId, status)` and
`(doctorId, status)` (they replace the single-column ones, which they also cover). Other hot paths
already had indexes: `schedules(startDateTime)`, `payments(status)`, `doctor(isDeleted)`,
`appointments(status, paymentStatus, paymentDeadline)` for the "cancel unpaid" job.

Measured with `EXPLAIN ANALYZE` on 200,000 appointments (2,000 patients, 50 doctors):

| Query | Old indexes | New indexes |
|-------|-------------|-------------|
| patient's unpaid count (booking limit) | 2.45 ms | 0.26 ms |
| doctor's completed count (dashboard stats) | 9.80 ms | 5.45 ms |
| patient's active appointments (overlap check) | 0.35 ms | 0.23 ms |

## Lean responses (12.2)

Lists return only what the app shows: appointment lists and details select a few doctor / patient
fields and a payment summary (never the stored Stripe session, checkout URL or Stripe ids, nor a
person's address or phone). Creating a doctor checks all chosen specialties in one query.
`tests/booking.test.ts` fails if Stripe data or private doctor fields reappear in these responses.

## Background jobs (12.3)

`src/app/utils/jobQueue.ts`: a durable queue in the `jobs` table (no Redis; works through Neon's
pooler). Invoice and prescription PDFs (+ Cloudinary upload + email) and reminder emails run there,
with retries (30 s, 1 min, 2 min … up to 5 attempts), then `FAILED` + an error log. The invoice job is
queued in the same transaction that marks the payment paid. Claims use `FOR UPDATE SKIP LOCKED`,
so several API instances can run the worker (`startJobWorker()` in `server.ts`, every 5 s); a job
whose worker died is picked up again after 10 minutes. Finished jobs are deleted after 7 days,
failed ones after 30 (`utils/retention.ts`).

Verification and password-reset codes are still sent directly: queueing them would store the code
in plain text in the database.

## Cache (12.4)

The public doctor list and the specialties are cached in memory for 60 s
(`src/app/utils/responseCache.ts`) and also sent with
`Cache-Control: public, max-age=60, stale-while-revalidate=300`. Every successful change to doctors,
specialties, reviews, account status or profiles clears the cache, so the 60 s is only an upper
bound. With more than one API instance, back the cache with Redis.

## Development data (12.7)

```bash
npm run seed:dev            # 10 specialties, 20 doctors, slots for 14 days, 10 patients with past consultations and reviews
npm run seed:dev -- --reset # remove earlier seed accounts first
```

Refuses to run with `NODE_ENV=production`. Seed accounts use `@seed.example.test` emails; the
password is printed by the script. Verification emails are not sent.
