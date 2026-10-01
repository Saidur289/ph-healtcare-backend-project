# API permission matrix

Every endpoint and who may call it. **Update this file whenever you add or change a route.**
Base path: `/api/v1` (except the webhook and better-auth).

Legend: **Public** = no login · **Any** = any logged-in user · **SA** = SUPER_ADMIN

All request bodies are validated with **strict** zod schemas: unknown fields (e.g. `role`, `isDeleted`, `patientId`) → 400.
Someone else's record is answered with **404** (we don't confirm it exists) or **403** when the action itself is not allowed.

## Public endpoints (intentionally no `checkAuth`)

| Method | Path | Notes |
|--------|------|-------|
| POST | `/auth/register` | always creates a PATIENT |
| POST | `/auth/login` | |
| POST | `/auth/refresh-token` | needs refresh-token cookie |
| POST | `/auth/verify-email` | |
| POST | `/auth/resend-verification-otp` | 60 s cooldown per email, same answer for unknown emails |
| POST | `/auth/forget-password` | 60 s cooldown, same answer for unknown emails |
| POST | `/auth/reset-password` | |
| POST | `/auth/logout` | works with an expired session; always clears cookies |
| GET | `/auth/login/google`, `/auth/google/success`, `/auth/oauth/error` | Google OAuth flow |
| GET | `/specialties` | |
| GET | `/doctors` | **safe fields only** (`doctorPublicSelect`); `?include=` / `?fields=` ignored |
| GET | `/doctors/:id` | safe fields + future free slots + reviews (reviewer name/photo only) |
| GET | `/doctors/:id/available-slots?from=&to=` | future, unbooked slots only (max 60 days) |
| POST | `/webhook` | Stripe only; protected by signature verification |
| * | `/api/auth/*` | better-auth handler. Over HTTP only `/sign-in/social`, `/callback/*`, `/error`, `/ok` are reachable (Google login); everything else returns 404. `role`, `status`, `needPasswordChange`, `isDeleted`, `deletedAt` can never be set from input (`input: false`) |

## Protected endpoints

| Module | Method | Path | Roles | Ownership rule (Phase 4) |
|--------|--------|------|-------|--------------------------|
| auth | GET | `/auth/me` | Any (also unverified) | self |
| auth | POST | `/auth/change-password` | Any | self; ends other sessions |
| users | POST | `/users/create-doctor` | ADMIN, SA | — |
| users | POST | `/users/create-admin` | SA | creates ADMIN only (never SA) |
| specialties | POST | `/specialties` | ADMIN, SA | — |
| specialties | DELETE | `/specialties/:id` | ADMIN, SA | — |
| doctors | GET | `/doctors/admin` | ADMIN, SA | — |
| doctors | GET | `/doctors/admin/:id` | ADMIN, SA | — |
| doctors | PATCH | `/doctors/:id` | ADMIN, DOCTOR, SA | DOCTOR: own profile only; `appointmentFee` and `registrationNumber` are admin-only |
| doctors | DELETE | `/doctors/:id` | ADMIN, SA | — |
| admins | PATCH | `/admins/change-user-status` | ADMIN, SA | ADMIN: doctors/patients only; SA: also admins; never self or SA; blocking ends sessions |
| admins | PATCH | `/admins/change-user-role` | SA | ADMIN ↔ SUPER_ADMIN only; never self; not the last SA; ends sessions |
| admins | GET | `/admins`, `/admins/:id` | ADMIN, SA | — |
| admins | PATCH | `/admins/:id` | SA | — |
| admins | DELETE | `/admins/:id` | SA | not self, never a SUPER_ADMIN |
| schedules | POST | `/schedules` | ADMIN, SA | — |
| schedules | GET | `/schedules`, `/schedules/:id` | ADMIN, SA, DOCTOR | — |
| schedules | PATCH / DELETE | `/schedules/:id` | ADMIN, SA | — |
| doctor-schedules | POST | `/doctor-schedules/create-my-doctor-schedule` | DOCTOR | self |
| doctor-schedules | GET | `/doctor-schedules/my-doctor-schedules` | DOCTOR | self (always filtered by the session's doctor) |
| doctor-schedules | PATCH | `/doctor-schedules/update-doctor-schedule` | DOCTOR | self |
| doctor-schedules | DELETE | `/doctor-schedules/delete-my-schedule/:id` | DOCTOR | self |
| doctor-schedules | GET | `/doctor-schedules`, `/doctor-schedules/:doctorId/schedule/:scheduleId` | ADMIN, SA | — |
| appointments | POST | `/appointments/book-appointment` | PATIENT | self; optional `Idempotency-Key` header |
| appointments | POST | `/appointments/book-appointment-with-pay-later` | PATIENT | self |
| appointments | POST | `/appointments/initiate-payment/:id` | PATIENT | own appointment, before the payment deadline |
| appointments | PATCH | `/appointments/reschedule/:id` | PATIENT | own, until 2 h before start, same doctor |
| appointments | GET | `/appointments/my-appointments` | PATIENT, DOCTOR | own only |
| appointments | GET | `/appointments/my-single-appointment/:id` | PATIENT, DOCTOR | own only; someone else's id → 404 |
| appointments | PATCH | `/appointments/change-appointment-status/:id` | DOCTOR, PATIENT, ADMIN, SA | owner or admin, rules in `appointment.stateMachine.ts` (see docs/booking.md) |
| patients | PATCH | `/patients/update-profile` | PATIENT | self; can delete only own reports; file links only from uploads |
| prescriptions | GET | `/prescriptions` | ADMIN, SA | — |
| prescriptions | POST | `/prescriptions` | DOCTOR | only the appointment's doctor |
| prescriptions | GET | `/prescriptions/my-prescriptions` | DOCTOR, PATIENT | own only |
| prescriptions | PUT / DELETE | `/prescriptions/:id` | DOCTOR | own only |
| reviews | POST | `/reviews` | PATIENT | own appointment, PAID and COMPLETED, once |
| reviews | GET | `/reviews/my-reviews` | PATIENT, DOCTOR | own only |
| reviews | GET | `/reviews` | ADMIN, SA | — |
| reviews | PATCH | `/reviews/update-review/:id` | PATIENT | own only |
| reviews | DELETE | `/reviews/delete-review/:id` | PATIENT | own only |
| stats | GET | `/stats` | Any | own role's stats |
