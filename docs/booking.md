# Booking engine

All timing values live in `src/app/module/appointment/appointment.constant.ts`.

## Time zones

**Every DateTime in the database is UTC.** Admins type wall-clock times ("09:00" on "2026-10-05");
the client sends its browser time zone (`timeZone`, e.g. `Asia/Dhaka`, default `CLINIC_TIME_ZONE`
env or `Asia/Dhaka`) and the server converts to UTC (`schedule.utils.ts`, DST-safe). The client shows
times in the viewer's own time zone.

## Schedules (admin)

- 30-minute slots, at most 60 days per request.
- Slots in the past are never created; slots overlapping an existing slot are skipped.
- `(startDateTime, endDateTime)` is unique.
- A schedule with active appointments can't be changed or deleted (409); schedules with past
  appointments can't be deleted at all (DB `Restrict`).

## Doctor slots

- A doctor can add only existing, future schedules.
- A slot with a booking can't be removed (409).
- Public: `GET /api/v1/doctors/:id/available-slots?from=&to=` → future, free slots (default 14 days, max 60).

## Booking (`book-appointment` = pay now, `book-appointment-with-pay-later`)

1. Doctor active, slot in the future, patient has no overlapping appointment and fewer than
   3 unpaid upcoming appointments. Pay later only when the slot starts ≥ 3 h from now.
2. One transaction: claim the slot with `updateMany(... isBooked: false → true)` (only one request
   can win), create the appointment + an UNPAID payment.
3. The DB index `appointment_active_slot` (unique `doctorId, scheduleId` where status ≠ CANCELED)
   makes a double booking impossible even if the code were wrong.
4. Payment deadline: pay now = now + 31 min, pay later = start − 2 h.
5. Pay now: the Stripe Checkout session is created **after** the commit (expires at the deadline).
   If Stripe fails, the booking is cancelled again and the slot is freed (502).
6. Optional `Idempotency-Key` header: the same key returns the same booking.

Tested live: 20 parallel requests for one slot → exactly 1 × 201 and 19 × 409.

## Status changes (`appointment.stateMachine.ts`)

| From | To | Who | Rule |
|------|----|-----|------|
| SCHEDULED | INPROGRESS | own doctor | paid; from 10 min before start until the slot ends |
| INPROGRESS | COMPLETED | own doctor | — |
| SCHEDULED | CANCELED | own patient | until 2 h before start; refund if paid |
| SCHEDULED | CANCELED | own doctor / admin | any time; refund if paid |
| SCHEDULED | CANCELED | system (cron) | unpaid and deadline passed |
| SCHEDULED | NO_SHOW | own doctor / admin | from 15 min after start |

Anything else → 409. Someone else's appointment → 404. Cancelling frees the slot in the same
transaction and records `cancelledAt`, `cancelledBy`, `cancelReason`. A paid appointment is refunded
in Stripe **first**; if the refund fails nothing changes (502, try again).

Reschedule (`PATCH /appointments/reschedule/:id`): own patient, until 2 h before start, to another
free future slot of the same doctor; payment carries over.

## Background jobs (every 5 min, `src/app.ts`)

- **Cancel unpaid**: SCHEDULED + UNPAID + deadline passed → CANCELED (SYSTEM), slot freed, payment
  kept as EXPIRED, Stripe session expired. Runs under a Postgres advisory lock, so only one server
  instance does it at a time.
- **Reminders**: emails to patient and doctor 24 h and 1 h before the start. Each appointment is
  claimed with a conditional update first, so a reminder is never sent twice.
- A payment that arrives after cancellation is refunded automatically by the webhook.
