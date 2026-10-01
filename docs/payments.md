# Payments (Stripe Checkout)

Code: `src/app/module/payment/` (`payment.stripe.ts` = calls to Stripe, `payment.service.ts` = webhook,
invoices, reconciliation).

## Money

- `Doctor.appointmentFee` and `Payment.amount` are **integers in whole taka** (BDT fees have no
  poisha). Stripe receives `amount * 100` (poisha). Minimum fee 50.
- `Payment.amount` is what the patient pays; invoices use it (not the doctor's current fee).

## Keys

- `sk_test_…` everywhere except production; the server refuses to start with a live key outside
  production, and with a test key in production (unless `ALLOW_STRIPE_TEST_IN_PRODUCTION=true`
  for a staging server).
- Local webhooks: `npm run stripe:webhook` (Stripe CLI) forwards the 4 handled events to
  `localhost:5000/webhook`. Copy the `whsec_…` it prints into `STRIPE_WEBHOOK_SECRET`.

## Flow

1. Booking creates the appointment + an UNPAID payment, then (pay now) a Checkout session that
   expires at the payment deadline (min 30 min, max 24 h). Session id/url are stored on the payment.
2. `POST /appointments/initiate-payment/:id` (pay later) reuses an open session or creates one.
3. Stripe redirects the patient to `/dashboard/my-appointments?payment=success|cancelled`; the page
   polls until the webhook has confirmed the payment.

## Webhook (`POST /webhook`, raw body)

| Event | What happens |
|-------|--------------|
| `checkout.session.completed` / `async_payment_succeeded` | appointment still SCHEDULED + UNPAID → PAID (+ payment intent id, paidAt); otherwise (cancelled, expired) → **automatic refund**, REFUNDED |
| `checkout.session.expired` | pay now → appointment cancelled (SYSTEM), slot freed, EXPIRED; pay later → session cleared, patient can pay again until the deadline |
| `charge.refunded` (full) | payment REFUNDED; if the appointment was still booked (refund from the Stripe dashboard) → cancelled (ADMIN), slot freed |
| anything else | ignored (200) |

- Every event id is stored in `stripe_webhook_events`: a duplicate delivery is answered 200 and
  ignored. If processing fails with a temporary error the id is removed again and we answer 500,
  so Stripe's retry processes it.
- Our own 4xx problems (unknown payment, nothing to refund) → 200 + error log (a retry would fail
  the same way). Bad signature → 400.
- The webhook only does fast DB work; the invoice runs afterwards.

## Invoices

- Number `INV-<year>-<000001>` from an atomic per-year counter (`invoice_counters`).
- PDF → Cloudinary → email, in the background after the webhook answered; a cron retries paid
  payments without invoice every 5 minutes. `INVOICE_DELIVERY=off` skips upload + email (tests/CI).

## Refunds

- Patient cancels ≥ 2 h before start, doctor/admin cancels any time → full refund **before** the
  appointment is cancelled (if Stripe fails, nothing changes; 502, try again).
- Refunds use an idempotency key (`refund-<paymentId>`), so they can't happen twice.

## Reconciliation (daily 03:00)

Compares the last 3 days of completed Stripe Checkout sessions with the DB and logs
`[payment-reconciliation]` errors for any mismatch (paid in Stripe but not in the DB, or PAID in the
DB without a Stripe payment intent). Read-only: a person decides how to fix.

## Tested (2026-10-01, Stripe test mode + Neon)

pay → PAID + invoice number · same event twice → ignored · patient cancels paid → real refund ·
cancel unpaid → session expired · pay after deadline → auto refund · session expired → cancelled ·
dashboard refund → cancelled + slot freed · bad signature → 400 · unknown payment / event → 200.
