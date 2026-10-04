# PH Healthcare: Doctor Appointment System Production Plan

This plan takes the current `server/` (Express + Prisma) and `client/` (Next.js 16) to a production-ready doctor appointment platform that is secure and well tested.

## How to use this file

- Work through the phases **in order**. Each phase builds on the one before it.
- When a task is finished, change `- [ ]` to `- [x]`.
- **[S]** marks a server task, **[C]** a client task and **[S+C]** a task for both.
- A phase is complete only when every box is ticked **and** its "Phase done when" check passes.
- Commit after each task (or small group of tasks) with a clear message, for example `fix(auth): require admin role on create-admin`.
- File paths are relative to `mission-6/`. Line numbers are from the review on 2026-10-01 and may move as you edit.

## Progress tracker

| # | Phase | Status |
|---|-------|--------|
| 0 | Preparation and safety net | ☐ |
| 1 | Critical security lockdown | ☑ |
| 2 | Core bug fixes (things that are broken today) | ☑ (end-to-end check pending DB) |
| 3 | Authentication and session hardening | ☑ (3.19 deliberately changed; browser test of register/verify still to do) |
| 4 | Authorization (who can do what) | ☑ |
| 5 | Appointment booking engine | ☑ |
| 6 | Payments (Stripe) | ☑ |
| 7 | Consultation: video call, prescription, review | ☐ |
| 8 | Frontend: finish every feature | ☐ |
| 9 | Platform security hardening | ☐ |
| 10 | Medical data protection and privacy | ☐ |
| 11 | Testing | ☐ |
| 12 | Performance and data quality | ☐ |
| 13 | DevOps, deployment and monitoring | ☐ |
| 14 | Launch checklist | ☐ |

### Full test run, Phases 1–6 (2026-10-01)

| Layer | Result |
|-------|--------|
| Type-check and lint, both projects | ✅ (client: the 2 old warnings) |
| Client production build (`next build`) | ✅ 40 routes plus the proxy |
| Server compile | ✅ with `--ignoreDeprecations 5.0`. ❌ `npm run build` itself still fails until **0.4** is fixed |
| Database-free tests (P1–P3) | ✅ route 401s, PDFs, 21 validation/error checks, 30 auth checks, 21 proxy checks, redirect attacks |
| Live tests on Neon and Stripe test mode | ✅ auth 16, ownership 21, booking 33 (20-way race), payments 16 |
| Browser test of the production build | ✅ login, redirect param, role guards, public doctor page, slot picking, pay-later booking, Stripe test Checkout opens, cancelled banner, logout, forced password change (with the policy shown in the form), doctor schedules, admin doctor list, all 14 admin sidebar links (no 404s), forgot password and duplicate register (no enumeration), wrong OTP message |

**Fixed during the test:**
- `getUserInfo` swallowed Next.js's internal "dynamic rendering" signal; it now uses `unstable_rethrow`.
- The auth actions now log the real error instead of only "Could not reach the server".

**Found (not fixed yet):**
- [ ] **Slow responses:** every DB round trip to Neon (US-East) takes **about 300 ms**, so login takes 3–5 s and booking about 15 s. Fixes:
  - move the Neon project to the region closest to your users (for example Singapore);
  - run independent queries in parallel (`Promise.all`);
  - keep the DB pool warm (12.x).
- [ ] `client/.env` and `.env.local` use `http://ph-server:5000`, which is a Docker host name. Without Docker, set `NEXT_PUBLIC_API_BASE_URL=http://localhost:5000/api/v1`.
- [ ] **UI (Phase 8):**
  - the doctor page shows `$800.00` (it should be ৳);
  - admin "Joined At" shows `10 01, 2026` (wrong date format);
  - the login and register cards aren't centred;
  - the doctor dashboard home is a stub.

---

## Phase 0: Preparation and safety net

**Goal:** you can change code without fear of losing work or breaking production data.

- [ ] **0.1 [S+C]** Commit or stash the current uncommitted work in both repos. Remove the debug `console.log` in `client/src/components/modules/Admin/ScheduleManagement/SchedulesTable.tsx:64` first.
- [ ] **0.2 [S+C]** Create a new branch in each repo, for example `hardening/phase-1`. Keep `master` deployable.
- [ ] **0.3 [S]** Commit the Prettier-only reformatting separately from logic changes so diffs stay readable.
- [x] **0.4 [S]** Fix `server/tsconfig.json`: the `ignoreDeprecations: "6.0"` value is invalid on TypeScript 5.9. Remove it or set it to `"5.0"`.
  - Done when `npx tsc --noEmit` passes.
  - _Done: set to "5.0"; `tsc --noEmit` is clean._
- [x] **0.5 [C]** Delete the stale `client/.next` folder and confirm `npx tsc --noEmit` shows only real errors.
  - _Done: stale .next removed; tsc shows no errors._
- [ ] **0.6 [S]** Add a `start` script (`node dist/server.js`) and make the compiled output runnable. With ESM and `moduleResolution: bundler`, either:
  - switch to `module/moduleResolution: NodeNext` and add `.js` extensions to imports, or
  - bundle with `tsup`/`esbuild`.
- [x] **0.7 [S]** Set up a separate **development database** so you never test against a shared or production one. Docker is optional: a locally installed PostgreSQL or a free cloud dev database (for example Neon or Supabase) works too.
  - Done (2026-10-01): Neon (`ep-lucky-fire…/neondb`). All 6 migrations are applied, and `prisma migrate diff` shows the DB matches the schema exactly.
- [ ] **0.8 [S+C]** Create `.env.example` files in both repos with every key name and a placeholder value. Never put real values in them.
- [ ] **0.9 [S+C]** Rotate any secret that was ever pasted into chat, screenshots or shared docs, or committed in an old branch. Check with `git log -p --all -S "sk_"`.
  - Covers the Stripe keys, SMTP password, Google secret, Cloudinary keys, JWT secrets, better-auth secret and super-admin password.
- [ ] **0.10 [S]** Remove the commented-out `docker run ... POSTGRES_PASSWORD` lines from `server/.env`.

**Phase done when:** both repos type-check, the server builds and starts with `npm run build && npm start`, and a local DB is running.

---

## Phase 1: Critical security lockdown

**Goal:** close the holes that let strangers take over the system or read patient data. Do this phase **before anything else is deployed**.

- [x] **1.1 [S]** Protect `POST /users/create-admin` with `checkAuth(Role.SUPER_ADMIN)` (`server/src/app/module/user/user.route.ts:15`).
- [x] **1.2 [S]** Remove `SUPER_ADMIN` from the allowed roles in `createAdminValidationSchema` (`server/src/app/module/user/user.validation.ts:67`). Only the seed script creates a super admin.
  - Done: `role` is now optional and can only be `ADMIN`. The service always sets `ADMIN`.
- [x] **1.3 [S]** In better-auth `additionalFields` (`server/src/app/lib/auth.ts:43-70`), set `input: false` on `role`, `status`, `isDeleted`, `needPasswordChange` and `deletedAt`. Public sign-up must always create a `PATIENT`.
  - `emailVerified` is a built-in field. better-auth never reads it from sign-up input.
  - `createDoctor`, `createAdmin` and the seed now set the role with prisma **after** sign-up.
  - [x] Verified: `/api/auth/sign-up/email` is now blocked over HTTP (404, see 3.x). Our `/auth/register` schema has no `role` field, and better-auth always applies the default for `input: false` fields.
- [x] **1.4 [S]** Protect `DELETE /specialties/:id` with `checkAuth(Role.ADMIN, Role.SUPER_ADMIN)` (`server/src/app/module/specialty/specialty.route.ts:12`).
- [x] **1.5 [S]** Remove `appointments`, `prescriptions` and patient data from the **public** doctor include config (`server/src/app/module/doctor/doctor.constant.ts:5-25`). Public doctor endpoints may return only:
  - name, photo, specialties, qualification, experience, fee, rating and available slots
  - never patient data
  - Done: `GET /doctors` and `GET /doctors/:id` use the fixed `doctorPublicSelect`, and `?include=` / `?fields=` are ignored.
  - New admin-only endpoints `GET /doctors/admin` and `GET /doctors/admin/:id` serve the full data. The client admin pages now call them.
- [x] **1.6 [S]** Use an explicit **allowlist** of fields for every public `select`. Never return the whole `user` object (it contains `email`, `status` and `needPasswordChange`).
  - Public doctor data no longer includes the doctor's private email, phone or address.
  - Admin user data uses `doctorUserAdminSelect`.
  - Public filtering and sorting are limited to safe fields.
- [x] **1.7 [S]** Cap `limit` in `QueryBuilder` (`server/src/app/utils/QueryBuilder.ts:225`), for example a maximum of 100 and a default of 10. Reject `page < 1`.
  - Done: the maximum is 100, configurable per query with `maxLimit`, and the page is at least 1.
- [x] **1.8 [S]** Audit **every route file** and write down the required role for each endpoint in a table (see 4.1). Any route without `checkAuth` must be intentionally public.
  - Done: see `server/docs/permissions.md`. The redundant second `checkAuth` on `PATCH /admins/:id` was removed.
- [x] **1.9 [S]** Stop logging secrets and personal data:
  - Remove `console.log` of OTPs (`auth.ts:130`), request bodies (`validateRequest.ts:12`), sessions and payloads.
  - Done for auth, validateRequest, checkAuth, patient, prescription, schedule, QueryBuilder and email. The remaining logs are tracked in 8.29 / 9.11.
- [x] **1.10 [C]** Fix the open redirect: `isValidateRedirect` (`client/src/lib/authUtils.ts:61`) must reject anything that doesn't start with a single `/`. That covers `//evil.com`, `https://…` and `/\evil.com`.
  - Done: only same-site relative paths are allowed, and they must be public, common or the user's own role area. Tested against 18 attack and normal cases.

**Phase done when:**
- An anonymous request cannot create users, delete specialties or see any patient data.
  - Verified: these return 401 without login: `POST /users/create-admin`, `DELETE /specialties/:id`, `GET /doctors/admin` and `GET /doctors/admin/:id`.
- Sign-up can only create patients. Code done; the runtime test is pending until the database is reachable (see 1.3).

---

## Phase 2: Core bug fixes (things that are broken today)

**Goal:** every existing feature actually works.

### Server
- [x] **2.1 [S]** Change `.font("Helvetica ")` to `.font("Helvetica")` in `prescription.utils.ts:44` and `payment.utils.ts:41`. Prescriptions and invoices currently always fail.
- [x] **2.2 [S]** Fix `validateRequest` (`server/src/app/middleware/validateRequest.ts`):
  - use `return next(parseResult.error)`;
  - wrap `JSON.parse(req.body.data)` in a try/catch that returns a 400;
  - handle `req.body === undefined`.
- [x] **2.3 [S]** Fix the Prisma error mapper (`server/src/app/errorHelpers/handlePrismaError.ts`):
  - P2002 means unique violation and should return 409, and P2025 means not found and should return 404.
  - Compare codes in **uppercase**.
  - Never send `meta` or the raw DB error to the client outside development.
- [x] **2.4 [S]** Await or catch every `sendEmail(...)` call (`auth.ts:104`, `auth.ts:121`) and the Cloudinary cleanup `Promise.all` (`deletedUploadedFilesFromGlobalErrorHandler.ts:24`). An email failure must never crash the server.
- [x] **2.5 [S]** Change `server.ts` so that `unhandledRejection` is **logged** and the process stops gracefully: close the HTTP server, run `prisma.$disconnect()`, then exit. It must not kill the process instantly.
  - Done:
    - SIGTERM/SIGINT and an uncaught exception now stop the cron jobs, close the server and disconnect Prisma before exiting, with a 10 s safety timeout.
    - An `unhandledRejection` is logged and the server **keeps running**, so one forgotten `await` can't take the site down for everyone.
    - A failed startup (seed or DB) exits with code 1.
    - The cron job catches its own errors.
- [x] **2.6 [S]** Add `appointmentId` to `CreateReviewZodSchema` (`server/src/app/module/review/review.validation.ts:3`).
- [x] **2.7 [S]** Change `GET /reviews/update-review/:id` to `PATCH` and validate the body.
- [x] **2.8 [S]** Fix the "my" queries that compare a `User.id` with a `Doctor.id` or `Patient.id`. Look up the profile first, then filter by its id:
  - `prescription.service.ts:197,213`
  - `review.service.ts:87,99`
- [x] **2.9 [S]** Fix `getMyDoctorSchedules` (`doctorSchedule.service.ts:50-53,73`) so it always filters by the logged-in doctor's id. Use the correct filterable-fields constant.
- [x] **2.10 [S]** Fix the prescription email:
  - `prescriptionId: result.id` is used before `result` exists (`prescription.service.ts:153`);
  - `s.title` should be `s.specialty.title` (`:147`).
- [x] **2.11 [S]** Fix `deleteAdmin` and `updateAdmin` (`admin.service.ts:59,82,96,106`):
  - use the correct ids;
  - read the flat payload;
  - run the transaction with `tx`.
- [x] **2.12 [S]** Fix the email OTP rule in `auth.ts:91-98`. OTPs must be sent no matter how many admins exist.
- [x] **2.13 [S]** Fix the stats service:
  - the doctor status distribution uses the array index as the status (`stats.service.ts:141`);
  - a missing profile must throw, not return global counts;
  - rename `barCharData` to `barChartData`.
- [x] **2.14 [S]** Make schedule create and update schemas require their fields (`schedule.validation.ts`). Remove DateTime fields from `searchableFields`. Return `meta` from `GET /schedules`.
- [x] **2.15 [S]** Fix the seed script (`server/src/app/utils/seed.ts:48,57`):
  - query by `email`;
  - don't delete the user blindly in `catch`;
  - make startup fail loudly if seeding fails.
- [x] **2.16 [S]** Make `deleteDoctor` throw `AppError(404)` instead of a plain `Error`, and also block the linked `User`.

### Client
- [x] **2.17 [C]** Fix `httpClient.ts:14`: change `if (!isTokenExpiringSoon(...))` to `if (!(await isTokenExpiringSoon(...)))`. Today the client refreshes on every request.
- [x] **2.18 [C]** Fix the token refresh in `client/src/services/auth.service.ts:23-28`: read the tokens from `data.data`, and return `false` when no token comes back.
- [x] **2.19 [C]** Align the doctor-schedule URLs with the server:
  - `PATCH /doctor-schedules/update-doctor-schedule`
  - `DELETE /doctor-schedules/delete-my-schedule/:id`
  - Also fixed: the update payload sends `scheduleId` (the server reads `scheduleId`, not `id`).
- [x] **2.20 [C]** Rename `needsPasswordChange` to `needPasswordChange` everywhere in the client so it matches the server and Prisma.
- [x] **2.21 [C]** Fix `doctorDetails.schedules` to `doctorSchedules` in `ViewDoctorProfileDialog.tsx:266,291`. (Done in Phase 1.)
- [x] **2.22 [C]** Fix the nav links that 404 in `client/src/lib/navItem.ts`:
  - `patients-management`
  - `book-appointment`
  - `admins-management`
  - `health-records`
  - `my-prescriptions`
  - Done:
    - The folder was renamed to `patients-management`.
    - "Book Appointment" now opens `/consultation`, because booking starts by choosing a doctor and a slot.
    - "Admins" is shown to SUPER_ADMIN only.
    - `admins-management`, `health-records` and `my-prescriptions` show a temporary "Coming soon" card until they are built in 7.8, 8.8 and 8.15.
- [x] **2.23 [C]** Fix the other nav problems: remove the duplicate Prescriptions item, and fix the icon names `home` → `Home` and `CalenderClock` → `CalendarClock`.
- [x] **2.24 [C]** Add `type="button"` to the password show/hide buttons in `LoginForm.tsx:94` and `RegisterForm.tsx:111`.
- [x] **2.25 [C]** Show the server's error message in actions: use `error.response?.data?.message` instead of `error.message`. Fix the `"digest" &&` check to `"digest" in error`.
- [x] **2.26 [C]** Fix the `h-screen,` typo in `(dashboardLayout)/layout.tsx:7`. Remove the placeholder text in `(commonProtectedLayout)/layout.tsx:10`.

**Phase done when:** each of these works end to end in the browser:
- create a doctor
- create schedules
- the doctor picks slots, then updates and deletes them
- a patient books and pays
- the doctor writes a prescription and the PDF arrives by email
- the patient leaves a review

**Status (2026-10-01):**
- All code tasks are done, and both projects pass type-check and lint.
- 21 database-free checks pass:
  - `validateRequest` (no double `next()`, bad JSON gives 400, a missing body gives 400);
  - the Prisma codes P2002→409, P2025→404 and P1xxx→503, with no database details shown in production;
  - the new review, schedule and prescription schemas.
- The prescription and invoice PDFs now generate (the font bug is fixed).
- [ ] Still to do: the browser click-through above, once the database is reachable.

**Extra fixes made while in these files:**
- A deleted review now resets the doctor's average rating to 0 instead of crashing on `null`.
- The refresh-token endpoint now sets the **new** refresh token cookie (part of 3.3).
- Unexpected server errors show "Something went wrong" in production; the details go to the server log.
- Uploaded files are now cleaned up for every upload type (part of 9.7).
- Prescription routes now use their zod validation (part of 7.4).
- Saving a prescription no longer runs inside a long transaction (part of 7.6).

---

## Phase 3: Authentication and session hardening

**Goal:** login, tokens and sessions follow industry practice.

### Design decision (choose one and write it down)
- [x] **3.1 [S+C]** Decide on **one** source of truth for sessions. Recommended: **keep better-auth sessions** as the source of truth, and keep the custom access JWT short-lived (10–15 min) and only for stateless checks.
  - Write the token flow in `server/README.md`: what cookies exist, their lifetime and who sets them.
  - Done (2026-10-01): **better-auth sessions are the source of truth.** The flow is written in `server/docs/auth.md`.

### Server
- [x] **3.2 [S]** Make `checkAuth` **fail closed** (`server/src/app/middleware/checkAuth.ts`):
  - a missing, invalid or expired session returns 401;
  - an invalid JWT returns 401 (fix the `if (!verifyToken)` check, which never fires because `verifyToken` returns an object);
  - a `BLOCKED` or `DELETED` user, or `isDeleted`, returns 403;
  - `emailVerified === false` returns 403 (except on routes needed to verify);
  - the session's userId must equal the JWT's userId.
  - Done:
    - The access token also carries the session id (`sid`), which must match.
    - Role and status are read from the DB, not from the token.
    - `checkAuthAllowUnverified()` is used only for `/auth/me`.
- [x] **3.3 [S]** Rewrite the refresh flow (`server/src/app/module/auth/auth.service.ts:144-198`):
  - reject expired sessions and don't extend them blindly;
  - bind the refresh token to the session and user;
  - re-read role and status from the DB, never from the old token;
  - **rotate** the refresh token on every use and detect reuse (an old token used again revokes all of that user's sessions);
  - make the controller set the **new** refresh token (`auth.controller.ts:70`).
  - Done:
    - New nullable column `session.refreshTokenHash`, with migration `20261001120000_session_refresh_token_hash`.
    - There is a 30 s grace window so two tabs refreshing at once don't log the user out.
    - Active sessions slide forward, capped at 30 days.
    - [x] Migration applied on Neon (2026-10-01).
- [x] **3.4 [S]** Set sane lifetimes:
  - the session is currently `60*60*60*24` seconds (about 216 days) and should be 1–7 days (`auth.ts:73`);
  - the access token should be 15 minutes;
  - the refresh token should be 7 days;
  - read all of them from env, with no hardcoded `maxAge`.
  - Done:
    - Your local `server/.env` now has `ACCESS_TOKEN_EXPIRES_IN=15m`.
    - better-auth's cookie cache is down to 5 min, so a revoked session stops working quickly.
- [x] **3.5 [S]** Revoke all of a user's sessions when the password changes, the password is reset, the user is blocked, the role changes or the account is deleted.
- [x] **3.6 [S]** Stop returning `accessToken`/`refreshToken` in JSON bodies (`auth.controller.ts:26,43`). Cookies only.
- [x] **3.7 [S]** Set cookie flags: `httpOnly: true`, `secure: true` in production, `sameSite: "lax"` (or `"strict"`), `path: "/"`. Make better-auth's `useSecureCookies` match (`auth.ts:146`).
  - `useSecureCookies` stays `false` on purpose: `true` renames the cookie to `__Secure-…`. `secure` is set through the cookie attributes instead, the same on the API and the client.
- [x] **3.8 [S]** Set a password policy: at least 8 characters, at least one letter and one number, a maximum of 128, and reject the top common passwords. Use the same rule in the server and client zod schemas.
- [x] **3.9 [S]** Make OTPs safe:
  - 6 digits, expiring after 10 minutes;
  - a maximum of 5 wrong attempts, then a new code is required;
  - at least 60 seconds between resends;
  - each code can be used once;
  - store only a hash.
  - Done:
    - better-auth `emailOTP` uses `expiresIn: 600`, `allowedAttempts: 5` and `storeOTP: "hashed"`.
    - The 60 s cooldown covers resend, forgot-password and register.
    - New endpoint: `POST /auth/resend-verification-otp`.
- [x] **3.10 [S]** Prevent account enumeration: `/forget-password` and `/register` return the same message whether or not the email exists.
  - Done: resend-OTP also does this, and reset-password answers "Invalid or expired code" instead of "Email not found".
- [x] **3.11 [S]** Lock the account after repeated failures: after 5–10 failed logins, lock it temporarily (for example 15 minutes) and email the user.
  - Done: 5 failures in 15 min lock the account for 15 min. The counter is in memory per server; move it to Redis in 9.2.
  - [ ] Email the user when their account gets locked (needs an email template).
- [x] **3.12 [S]** Make the Google login safe:
  - handle users without an `accounts[0]` and users with both password and Google (`auth.service.ts:221,314`);
  - URL-encode the `error` query param;
  - fix the malformed `/auth/google?login?error=` URL.
  - Done:
    - Errors redirect to `/login?error=…`.
    - The login page shows only fixed messages, never raw query text.
    - Blocked or deleted users can't log in with Google.
    - The redirect path is validated.
  - [ ] Production: the Google callback sets cookies on the API's domain. That only works when the API and frontend share a parent domain; otherwise route the callback through the Next.js app (see `server/docs/auth.md`).
- [x] **3.13 [S]** Wire up `changeUserStatus` and `changeUserRole` routes (SUPER_ADMIN only for role changes). They must revoke sessions (3.5).
  - Done:
    - `PATCH /admins/change-user-status`: ADMIN can manage doctors and patients; SUPER_ADMIN can also manage admins.
    - `PATCH /admins/change-user-role`: SUPER_ADMIN only, ADMIN ↔ SUPER_ADMIN, and the last super admin can't be demoted.

### Client
- [x] **3.14 [C]** Fix the proxy (`client/src/proxy.ts`):
  - always run the **role check**, even when the token is near expiry (lines 63-94);
  - an expired or invalid token tries a refresh once, and if that fails it clears the cookies and redirects to `/login?redirect=…`;
  - catch blocks must **deny** (redirect to login), never let the request through (lines 194-196).
  - Done:
    - The proxy refreshes with `fetch` and writes the new cookies on its own response, because `cookies().set` doesn't work in the proxy.
    - The fresh cookies are also forwarded to the server components rendering that request.
    - `httpClient` no longer refreshes at all.
    - Tested with 21 cases.
- [x] **3.15 [C]** Fix the redirect loops:
  - remove `/verify-email` and `/reset-password` from the "logged-in users get redirected away" list (`authUtils.ts:6-7`);
  - unverified users may see only `/verify-email`;
  - users who must change their password may see only `/change-password`.
  - Done:
    - Unverified users never get a session (login sends them to `/verify-email`), so there is no loop.
    - `needPasswordChange` is in the access token, so the proxy enforces it without an API call.
- [x] **3.16 [C]** Fix the `/forget-password` vs `/forgot-password` route name mismatch in `authUtils.ts`.
- [x] **3.17 [C]** Build **Logout**: call `POST /auth/logout`, delete all auth cookies, clear the TanStack Query cache and redirect to `/login`. `UserDropdown.tsx:52` is empty today.
- [x] **3.18 [C]** Remove `"use server"` from `client/src/lib/tokenUtils.ts` and add `import "server-only"`. A client must not be able to set cookies through a server action.
- [ ] **3.19 [C]** Add `import "server-only"` to every `services/*.ts`. Client components must call `_action.ts` files, which validate with zod and check the session, not raw services.
  - **Changed on purpose (not done as written):**
    - Client components still call the data services directly.
    - The API checks the session, role and ownership on every request, so this is safe as long as the API keeps doing that (Phase 4).
    - The dangerous ones are no longer server actions: `tokenUtils.ts` and `auth.service.ts` (cookie setting, refresh).
    - The `server-only` package isn't installed.
  - [ ] Optional later: move every service call behind `_action.ts` wrappers.
- [x] **3.20 [C]** Re-check the role in each dashboard `layout.tsx` (admin, doctor, patient) on the server as defense in depth. If it doesn't match, call `redirect()`.
- [x] **3.21 [C]** Handle `getUserInfo()` returning `null` in `DashboardSidebar.tsx:11` and `DashboardNavbar.tsx:10`, which crash today.
- [x] **3.22 [C]** Call `/auth/me` once per request: wrap it in React `cache()` and share it between the proxy, layout, sidebar and navbar. Make the server's `/auth/me` return only profile fields, not all appointments and prescriptions.
- [x] **3.23 [C]** Finish the auth pages:
  - verify email with OTP input, resend button and cooldown timer;
  - forgot password;
  - reset password with OTP and new password;
  - change password.
  - Done: all four pages are built. They use a reusable `AppPasswordField`. `/change-password?required=1` explains the forced first-login change.
- [x] **3.24 [C]** Fix the register flow:
  - use `IRegisterResponse`;
  - handle `token: null`;
  - `name` must be at least 1 character;
  - correct the "Welcome back" text;
  - rename the page component;
  - after register, go to `/verify-email?email=…` (URL-encode it).
  - Done: registering no longer logs the user in. They verify the email first, then log in.

**Status (2026-10-01):**
- Server: 31 database-free checks pass, including better-auth sign-up/sign-in being blocked over HTTP, endpoints failing closed with 401, the password policy, logout clearing all cookies, and no tokens in JSON responses.
- Client: 21 proxy checks pass with real signed tokens and a mocked refresh endpoint.
- Both projects pass type-check and lint.
- 16 live API checks pass on Neon (2026-10-01):
  - super admin seeded and verified;
  - a wrong password returns 401;
  - login sets 3 cookies, with no tokens in the JSON;
  - `/me` returns the slim profile;
  - the admin endpoint is reachable;
  - refresh rotates the refresh token;
  - a reused old refresh token gives 401 and deletes all of that user's sessions;
  - logout deletes the session;
  - garbage cookies give 401.
- [ ] Still to do in the browser: register → email code → verify → login, the forced password change for an admin-created doctor, and logout from the dropdown.

**Phase done when:**
- A blocked user is kicked out within 15 minutes or less.
- An old refresh token cannot be reused.
- A patient can never see `/admin/*`.
- Logout works.
- Every auth page works.

---

## Phase 4: Authorization (who can do what)

**Goal:** every endpoint checks **role** and **ownership**. No user can read or change another user's data by changing an id in the URL (IDOR).

- [x] **4.1 [S]** Create `server/docs/permissions.md`, a permission matrix with one row per endpoint and these columns:
  - Public, PATIENT, DOCTOR, ADMIN, SUPER_ADMIN
  - the ownership rule, for example "patient: own appointments only"
- [x] **4.2 [S]** Add a helper, `getProfileOrThrow(req.user)`, that returns the Patient, Doctor or Admin profile for the logged-in user. Use it in every "my" endpoint.
  - Done:
    - `utils/profile.ts` (`getPatientProfileOrThrow`, `getDoctorProfileOrThrow`) is used for reviews and prescriptions.
    - The other "my" endpoints already look up the profile from the session user, and the live tests prove it.
    - Use the helper in all new code.
- [x] **4.3 [S]** `PATCH /doctors/:id`:
  - a DOCTOR may edit **only themselves**;
  - a DOCTOR may not change `appointmentFee`, `isDeleted` or other admin-only fields (admin only);
  - run auth **before** validation.
- [x] **4.4 [S]** Medical reports: delete only when `report.patientId === myPatient.id` (`patient.service.ts:73`).
  - Also:
    - Report links and the profile photo can only come from real uploads; URLs in the JSON body are ignored.
    - Cloudinary files are deleted after the DB commit.
    - Fixed: every profile update without reports used to fail validation.
- [x] **4.5 [S]** Appointments:
  - a patient sees only their own;
  - a doctor sees only appointments with them;
  - an admin sees everything;
  - the same rule applies to `my-single-appointment/:id`.
- [x] **4.6 [S]** Prescriptions:
  - only the appointment's doctor can create, edit or delete;
  - only the appointment's patient and doctor can read;
  - admins can read.
- [x] **4.7 [S]** Reviews: only the appointment's patient can create, edit or delete, and only once per appointment.
  - Also: the appointment must be PAID **and COMPLETED**. Reviews only become possible once Phase 5 lets doctors complete appointments.
- [x] **4.8 [S]** Admin vs super admin:
  - an ADMIN cannot create, edit or delete other admins, or change roles;
  - nobody can delete or demote themselves or the last super admin.
- [x] **4.9 [S]** Make every zod body schema `.strict()` so unknown fields such as `role`, `isDeleted`, `paymentStatus` or `doctorId` are rejected. This prevents mass assignment.
- [x] **4.10 [S]** Never spread `...payload` straight into `prisma.create/update` (for example `prescription.service.ts`). Pick fields explicitly.
  - Done:
    - Prescriptions, reviews and admins pick fields explicitly.
    - The remaining spreads (patient info and health data, doctor create and update, specialty) take their objects from **strict** schemas, so they can only contain allowed fields.

**Status (2026-10-01):** 21 live ownership checks pass on Neon with throw-away accounts that were deleted afterwards. They cover:
- a doctor editing another doctor, or changing their own fee;
- reading, paying for or changing someone else's appointment;
- deleting someone else's medical report;
- reviewing or prescribing for someone else's appointment;
- admin-only routes;
- unknown fields such as `role`, `isDeleted` and `patientId` being rejected.

Also fixed in passing:
- the appointment status endpoint read the whole body as the status;
- removing one specialty from a doctor deleted all of them;
- the specialty ids are now checked.

**Phase done when:** for each "my" endpoint, a test using user B's token on user A's resource gets a 403 or 404 (see Phase 11).

---

## Phase 5: Appointment booking engine

**Goal:** booking is **atomic**, a slot can never be double-booked, and the appointment lifecycle is clear and enforced.

### 5A. Data model changes (one migration)
- [x] **5.1 [S]** Add these fields to `Appointment`:
  - `paymentDeadline DateTime`, after which an unpaid appointment is auto-cancelled;
  - `cancelledAt DateTime?`, `cancelledBy Role?` and `cancelReason String?`;
  - `startedAt DateTime?` and `completedAt DateTime?`.
  - Done:
    - Migration `20261001150000_booking_engine` adds these, plus `isPayLater`, `idempotencyKey`, `reminder24hSentAt` and `reminder1hSentAt`.
    - Payment gets `checkoutSessionId`, `checkoutUrl` and `refundId`.
    - `paymentDeadline` is nullable so older rows stay valid.
- [x] **5.2 [S]** Add a **partial unique index** in the migration SQL, so only one active appointment can exist per doctor slot:
  ```sql
  CREATE UNIQUE INDEX appointment_active_slot
    ON appointments ("doctorId", "scheduleId")
    WHERE status <> 'CANCELED';
  ```
  - Done: this lives in the Prisma schema itself via the `partialIndexes` preview feature, so future migrations won't drop it.
- [x] **5.3 [S]** Optionally add `NO_SHOW` to `AppointmentStatus` and `REFUNDED` to `PaymentStatus`.
  - Also added: `PaymentStatus.EXPIRED` and the `CancelledBy` enum (PATIENT, DOCTOR, ADMIN, SYSTEM).
- [x] **5.4 [S]** Change `onDelete: Cascade` to `Restrict` on Appointment → Schedule/Doctor/Patient and on Payment and Prescription. Medical and financial records must **never** be hard-deleted by a cascade.
- [x] **5.5 [S]** Add a unique constraint or overlap check so a schedule cannot be created twice for the same `startDateTime`/`endDateTime`.

### 5B. Schedules and slots
- [x] **5.6 [S]** Store every time in **UTC**. The client shows it in the user's local timezone (use `date-fns-tz` or `Intl`). Write this rule in the README.
  - Done:
    - Written in `server/docs/booking.md`.
    - The client sends its browser time zone, and the server converts to UTC with DST handled correctly.
    - The old `convertDateTime` stored the wall-clock time as if it were UTC, which was wrong by the time-zone offset.
- [x] **5.7 [S]** Validate schedule creation:
  - `start < end`;
  - the duration is a fixed slot length, for example 30 minutes;
  - no times in the past;
  - no overlaps.
- [x] **5.8 [S]** Validate doctor schedule selection:
  - the doctor can pick only future slots;
  - the doctor cannot remove a slot that already has an active appointment.
- [x] **5.9 [S]** Add a public endpoint `GET /doctors/:id/available-slots?from=&to=` that returns only future, unbooked slots.

### 5C. Booking (pay now and pay later)
- [x] **5.10 [S]** Rewrite `bookAppointment` **and** `bookAppointmentWithPayLater` (`server/src/app/module/appointment/appointment.service.ts`) as one shared function, inside a single transaction. Steps:
  1. Check the doctor is active and not deleted, the slot is in the future, and the patient is active and verified.
  2. Claim the slot **atomically**:
     ```ts
     const { count } = await tx.doctorSchedules.updateMany({
       where: { doctorId, scheduleId, isBooked: false },
       data: { isBooked: true },
     });
     if (count !== 1) throw new AppError(409, "Slot already booked");
     ```
  3. Create the Appointment with `paymentDeadline`:
     - pay now: `now + 30 min`;
     - pay later: for example `slot start − 2 h`.
  4. Create the Payment row (UNPAID) with the amount in **integer cents**.
  5. **After** the transaction commits, create the Stripe session (see Phase 6). Never call Stripe inside a DB transaction.
- [x] **5.11 [S]** Add booking rules:
  - a patient cannot book two overlapping appointments;
  - set a maximum number of active unpaid appointments per patient (for example 3);
  - a doctor cannot book themselves.
- [x] **5.12 [S]** Use an idempotency key: the client sends an `Idempotency-Key` header on booking, so double-clicking or a network retry doesn't create two appointments.
  - Done:
    - The client creates one `crypto.randomUUID()` per booking attempt, and a new one after any failure.
    - Two simultaneous requests with the same key return the same appointment (tested).

### 5D. Lifecycle (state machine)
- [x] **5.13 [S]** Create `appointment.stateMachine.ts` with the allowed transitions:

  | From | To | Who | Rule |
  |------|----|-----|------|
  | SCHEDULED | INPROGRESS | DOCTOR (own) | only from 10 min before start, and only if PAID |
  | INPROGRESS | COMPLETED | DOCTOR (own) | — |
  | SCHEDULED | CANCELED | PATIENT (own) | until X hours before start; refund if paid |
  | SCHEDULED | CANCELED | DOCTOR (own) / ADMIN | any time; always refund if paid |
  | SCHEDULED | CANCELED | SYSTEM (cron) | unpaid and `paymentDeadline < now` |
  | SCHEDULED | NO_SHOW | DOCTOR / SYSTEM | optional |

- [x] **5.14 [S]** Replace the current status logic (`appointment.service.ts:179-229`) with the state machine:
  - validate `status` with a zod enum;
  - return 403 or 409 for transitions that aren't allowed (instead of a 200 that does nothing);
  - when an appointment is cancelled, set `isBooked = false` on the slot inside the same transaction.
- [x] **5.15 [S]** Add rescheduling (`PATCH /appointments/reschedule/:id`): a patient moves to another free slot of the same doctor, as one transaction that releases the old slot and claims the new one. Payment carries over.

### 5E. Background jobs
- [x] **5.16 [S]** Rewrite the unpaid-appointment cron (`appointment.service.ts:349-397`):
  - select only `status = SCHEDULED AND paymentStatus = UNPAID AND paymentDeadline < now()`;
  - use `tx` everywhere inside the transaction (not `prisma`);
  - set the appointment to CANCELED and `cancelledBy = SYSTEM`, and release the slot **only if it still belongs to this appointment**;
  - **do not delete** the Payment row; mark it cancelled or expired;
  - expire the Stripe Checkout session (`stripe.checkout.sessions.expire`).
- [x] **5.17 [S]** Make the cron safe when more than one server is running: use a Postgres advisory lock (`pg_try_advisory_lock`), or move jobs to a separate worker process.
- [x] **5.18 [S]** Send reminder emails 24 h and 1 h before an appointment to the patient and the doctor, and record that each was sent so it is never sent twice.
  - Done:
    - `appointment.reminder.ts` and the `reminder.ejs` template.
    - The cron now runs every 5 minutes (it was every 25).
    - [ ] Not yet tested live, because it sends real emails. Check it once with your own email address.

**Phase done when:** a test that sends 20 parallel booking requests for the same slot ends with **exactly 1** appointment and 19 responses of 409.

**Status (2026-10-01):**
- **Verified:** the race test passed 3 times in a row on Neon (1 × 201, 19 × 409, 1 appointment in the DB).
- **33 live checks pass:**
  - schedules: time-zone conversion, overlaps skipped, past dates refused;
  - doctor slots: past slots refused, booked slots can't be removed;
  - idempotency;
  - available slots;
  - the state machine: start needs payment, invalid transitions, no-show timing, someone else's appointment gives 404;
  - reschedule;
  - patient cancel frees the slot and keeps the payment as EXPIRED, and the slot can be rebooked;
  - the unpaid limit, overlaps and the pay-later lead time;
  - the cron job;
  - start → complete → review.
- **Found and fixed under load:** with 20 simultaneous bookings, transactions timed out waiting for a DB connection (P2028 → 400). The booking transaction now waits up to 10 s, a taken slot is refused before any transaction starts, and P2028 maps to 503 and P2034 to 409.
- [ ] Not tested live (they need Stripe test keys): pay now (Checkout session), cancelling a **paid** appointment (refund), and the webhook's automatic refund of a late payment. Test these in Phase 6 with the Stripe CLI.

---

## Phase 6: Payments (Stripe)

**Goal:** money is never lost, never taken twice and always matches an appointment.

- [x] **6.1 [S]** Store money as an **integer in the smallest unit** (cents or poisha):
  - change `Payment.amount` and `Doctor.appointmentFee` from `Float` to `Int`;
  - `unit_amount` must be an integer.
  - Done:
    - **Decision:** amounts are stored as an integer in **whole taka**, because BDT fees have no poisha. That removes float errors without changing how fees are entered or shown. Stripe gets `amount * 100`.
    - The minimum fee is 50, the same rule on client and server.
    - Migration: `20261001170000_payments_hardening`.
- [x] **6.2 [S]** Create Checkout sessions **outside** DB transactions, with:
  - `expires_at = paymentDeadline` (minimum 30 min);
  - `metadata: { appointmentId, paymentId }`;
  - `client_reference_id`;
  - an idempotency key.
- [x] **6.3 [S]** Handle these webhook events (`server/src/app/module/payment/payment.service.ts`):
  - `checkout.session.completed`: mark PAID only if the appointment is still SCHEDULED. If it was already cancelled, **refund automatically**.
    - Done in Phase 5: the guard and the automatic refund. The other events below are still open.
  - `checkout.session.expired`: release the slot and mark the payment expired.
  - `charge.refunded`: set the payment to REFUNDED.
  - Done:
    - Also `async_payment_succeeded`.
    - A refund made in the Stripe dashboard also cancels a still-booked appointment and frees the slot.
    - Processed event ids go in the new `stripe_webhook_events` table, so a duplicate delivery is ignored.
- [x] **6.4 [S]** Make the webhook return 2xx for events it has already processed or doesn't handle, and **never** 500 for a "not found" case, because Stripe retries 500s for days. Log and alert instead.
  - Done: our own 4xx errors get 200 and a log entry. Real temporary failures get 500, and the event is "un-claimed" so Stripe's retry processes it.
- [x] **6.5 [S]** Move invoice PDF generation, the Cloudinary upload and the email **out of** the webhook transaction, into a background step. The webhook must answer in under 5 seconds.
  - Done:
    - The webhook only marks the payment paid; the invoice runs right after, in the background.
    - A cron retries missing invoices every 5 min.
    - `INVOICE_DELIVERY=off` skips upload and email for tests and CI.
    - Moving this to a real job queue is task 12.3.
- [x] **6.6 [S]** Fix the invoice data: `invoiceId` should be the payment or invoice number, not the patient id. Use a readable invoice number such as `INV-2026-000123`.
  - Done:
    - An atomic per-year counter (`invoice_counters`) gives numbers like `INV-2026-000001`.
    - The invoice amount comes from `Payment.amount`, not the doctor's current fee.
- [x] **6.7 [S]** Implement refunds through `stripe.refunds.create` and store the refund id. Follow the cancellation policy from 5.13.
  - Done in Phase 5: `payment.stripe.ts` `refundCheckoutPayment` (with an idempotency key). Still to test with Stripe test mode.
- [x] **6.8 [S]** Make `POST /initiate-payment/:id` work for pay-later appointments:
  - check ownership, UNPAID status and that the deadline hasn't passed;
  - reuse an open session if one exists.
- [x] **6.9 [S]** Add a daily reconciliation job that compares Stripe payments with DB payments and alerts on any mismatch.
  - Done: daily at 03:00 it compares the last 3 days and logs `[payment-reconciliation]` errors. It only reports; it fixes nothing on its own.
- [x] **6.10 [C]** Build the payment success and cancel pages:
  - show a clear status message;
  - poll the appointment until the webhook has updated it;
  - the redirect target must be a real page (today `/dashboard/my-appointments` is a stub).
  - Done:
    - `/dashboard/my-appointments` shows the list plus a `PaymentResultBanner`: on success it polls every 2 s for up to 30 s; on cancel it explains what happened.
    - "Pay Now" only shows for SCHEDULED + UNPAID appointments.
    - [ ] Check it in the browser after a real test-mode Checkout payment (card 4242 4242 4242 4242).
- [x] **6.11 [S+C]** Use Stripe **test mode** keys locally and in CI, and **live** keys only in production. Never let the two mix.
  - Done:
    - The server refuses to start with `sk_live_` outside production, and with `sk_test_` in production (unless `ALLOW_STRIPE_TEST_IN_PRODUCTION=true` for staging).
    - Your current key is a test key.
    - `npm run stripe:webhook` forwards only the 4 handled events.

**Phase done when:** all of these leave correct DB states:
- pay
- cancel before paying
- pay after the deadline (refunded automatically)
- refund
- the webhook delivering the same event twice

**Status (2026-10-01):**
- All 16 live checks pass in Stripe **test mode** against Neon, using real test-mode Checkout sessions, PaymentIntents and refunds, and webhook events signed with your secret. They cover:
  - pay (PAID and an invoice number);
  - a duplicate event being ignored;
  - patient cancel → real refund;
  - cancel before paying → session expired;
  - paying after the deadline → automatic refund;
  - an expired session → cancelled;
  - a dashboard refund → cancelled and slot freed;
  - a bad signature → 400;
  - an unknown payment or event → 200;
  - reconciliation.
- Docs: `server/docs/payments.md`.
- [ ] Still to do: one real Checkout in the browser with `npm run stripe:webhook` running, to see the full redirect → banner → invoice email.

---

## Phase 7: Consultation: video call, prescription, review

**Goal:** the appointment itself happens inside the app.

### Video call
- [x] **7.1 [S]** Choose a provider: Daily.co, Agora, 100ms, Twilio or self-hosted Jitsi.
  - `videoCallingId` is the room id.
  - The provider's join token is created **on the server**.
  - _Done: Daily.co. Private room per appointment (name = videoCallingId), created on first join; tokens are issued only on the server._
- [x] **7.2 [S]** Add `GET /appointments/:id/join` that returns a short-lived join token only when **all** of these are true:
  - the caller is the patient or doctor of this appointment;
  - the appointment is PAID;
  - its status is SCHEDULED or INPROGRESS;
  - the time is between 10 minutes before start and the end of the slot.
  - _Done: owner-only (others get 404); PAID + SCHEDULED/INPROGRESS; open from 10 minutes before start until the slot ends; token expires 15 minutes after the end; 503 when the key is missing._
- [x] **7.3 [C]** Build the video call page `/consultation/room/[appointmentId]`:
  - waiting room;
  - camera and mic check;
  - when the doctor joins, the appointment moves to INPROGRESS.
  - _Done: waiting room with countdown, camera/mic check, Daily Prebuilt iframe; doctor joining sets INPROGRESS; doctor has Write prescription and Complete buttons._

### Prescription
- [x] **7.4 [S]** Validate prescriptions with the existing `prescription.validation.ts`. Include `instructions`, `followUpDate` and a list of medicines (name, dose, frequency, duration).
  - _Done: strict zod; 1 to 30 medicines (name, dose, frequency, duration, notes)._
- [x] **7.5 [S]** Allow a prescription only for COMPLETED or INPROGRESS appointments, by that appointment's doctor, and only one per appointment.
  - _Done: only that appointment's doctor; status INPROGRESS or COMPLETED; duplicates get 409._
- [x] **7.6 [S]** Generate the PDF and email it **after** the DB commit. A failed email is retried and never breaks the save.
  - _Done: PDF and email are sent after the commit (setImmediate); emailSentAt is set; the cron retries unsent ones._
- [x] **7.7 [C]** Build the doctor's prescription form and list (`doctor/dashboard/prescriptions`).
  - _Done: form with a dynamic medicine list, plus a list page._
- [x] **7.8 [C]** Build the patient's prescriptions page `/dashboard/my-prescriptions` with a PDF download.
  - _Done: list with PDF download._

### Review
- [x] **7.9 [S]** Allow a review only for COMPLETED appointments, once per appointment:
  - the rating is an integer from 1 to 5;
  - the comment has a maximum of 1000 characters and its HTML is stripped.
  - _Done: COMPLETED only, one per appointment; integer rating 1 to 5; HTML stripped; comment 5 to 1000 characters._
- [x] **7.10 [S]** Update the doctor's `averageRating` and `reviewCount` in the same transaction as each review change.
  - _Done: averageRating and reviewCount are updated in the review transaction._
- [x] **7.11 [C]** Build a review form on completed appointments, the doctor's "My reviews" page and reviews on the public doctor profile.
  - _Done: review form on completed appointments, doctor My reviews page, reviews on the public profile._

**Phase done when:** these work end to end (checked 2026-10-02: live API suite 34/34 and browser E2E with real Daily):
- the patient books, pays and joins the call at the right time
- the doctor completes the appointment and writes the prescription
- the patient gets the PDF and leaves a review

---

## Phase 8: Frontend: finish every feature

**Goal:** no placeholder pages, every nav link works, and the UI handles loading, empty and error states.

### 8A. Design system: follow the "Pranovate" design (do this first in Phase 8)
Reference: <https://dribbble.com/shots/27693703-Pranovate-Doctor-Appointment-Management-Dashboard>.
Follow it as closely as possible on every dashboard (doctor, patient, admin), using the same shell with different nav items.

What the design looks like:
- **Layout:**
  - fixed **dark navy sidebar** on the left (about 240 px wide), logo at the top, icon and label nav items;
  - the **active item is a solid blue rounded pill** with white text;
  - **Logout** sits in a bordered box at the bottom.
- **Top bar (white):**
  - rounded grey search input ("Search patients, appointments, prescriptions…");
  - a green **"Available" toggle** (doctor online or offline);
  - a primary blue **"+ Add …"** button;
  - a notification bell;
  - avatar, name and role.
- **Page header:** "Hello, Dr. {name}" with today's date in small grey text below.
- **Stat cards (a row of 3):**
  - label at the top left and a small **tinted icon square** at the top right;
  - a big number;
  - a green trend line ("↑ 2 vs yesterday").
- **Table card ("Upcoming Appointments"):**
  - a "View All >" link at the top right;
  - rows show avatar, name, and gender icon with age, then date, time, and a **type badge** (light-blue "Book Visit" or light-green "Video Consult");
  - **action buttons** (teal "Check In", blue "Join Now") and a ⋮ menu.
- **Style:**
  - light grey page background;
  - white cards with a 1 px light border, about 12 px radius and a very soft shadow;
  - a clean sans-serif font (Inter-like);
  - small text (12–14 px).
- **Approximate colours** (estimated from the shot; adjust by eye):

  | Use | Colour |
  |-----|--------|
  | sidebar | `#0B1B2E` |
  | primary blue | `#1565D8` |
  | teal action | `#14B8A6` |
  | success green | `#16A34A` |
  | page background | `#F4F6F9` |
  | border | `#E5E7EB` |
  | text | `#111827` |
  | muted text | `#6B7280` |

- [x] **8.D1 [C]** Put the colours above into `client/src/app/globals.css` as shadcn CSS variables (`--primary`, `--sidebar`, `--background`, `--border`, …), and add a dark-mode version. Set the font (Inter via `next/font`).
  - _Done: design tokens (hex) + dark set in globals.css, soft tints (success/teal/warning/danger), Inter via next/font, next-themes toggle in the top bar._
- [x] **8.D2 [C]** Rebuild the dashboard shell (`DashboardSidebar`, `DashboardNavbar`, `(dashboardLayout)/layout.tsx`) to match: navy sidebar, blue active pill, Logout at the bottom, white top bar with search, availability toggle (doctor only), primary action button, bell and user chip. On mobile it becomes a drawer.
  - _Done: shared SidebarNav (navy, blue pill, sub-page matching, Logout box) for desktop and the mobile drawer; top bar with role-based search + "+" action, doctor Available switch (PATCH /doctors/me/availability, saved on Doctor.isAvailable), theme toggle, bell with real items (calls within 24 h, unpaid bookings), user chip._
- [x] **8.D3 [C]** Restyle `StatsCard` to match: icon square at the top right, big number, green or red trend line. Use it on all three dashboards.
  - _Done: tones, icon square, big number, up/down/flat trend line; used on all three homes._
- [x] **8.D4 [C]** Restyle `DataTable` to match: card with a title and a "View All" link, avatar cell with gender and age, badge cell for type and status, action buttons and a ⋮ menu.
  - _Done: card with title + View All, muted header row, row action buttons + ⋮ menu, UserInfoCell (avatar, gender, age), StatusPill badges; fixed the empty-row colSpan._
- [x] **8.D5 [C]** Doctor dashboard home = the shot itself: greeting, 3 stat cards (appointments today, total patients, today's earnings), then upcoming appointments with **Check In** (in-person) or **Join Now** (video) buttons.
  - _Done: greeting + date, Appointments Today / Total Patients / Today's Earnings with vs-yesterday trends (stats API now returns today/yesterday numbers in APP_TIMEZONE, default Asia/Dhaka, queries in parallel), Upcoming Appointments with Join Now, rating and status cards. There is no in-person visit type in this app, so there is no Check In button._
- [x] **8.D6 [C]** Apply the same look to the patient and admin dashboards and the auth pages, so the whole app feels like one product.
  - _Done: patient, doctor and admin pages, auth pages (navy brand panel + form), public site, older admin lists (headers, BDT fees, token colours) all use the design._

### Public
- [x] **8.1 [C]** Home page: hero, search by specialty or doctor, featured doctors, how-it-works section and footer. Replace "Hello World".
  - _Done: public header (Dashboard button when logged in) + navy footer; hero with search, specialty chips, top-rated doctors, how-it-works, CTA._
- [x] **8.2 [C]** `/consultation`: search, filters (specialty, fee, rating, gender), sorting and pagination, with the filters stored in the URL.
  - _Done: DoctorCard grid, filters in the URL (gender, specialty, fee, new rating filter averageRating[gte]), sort, pagination, skeleton and empty state; removed the non-existent OTHER gender; fees shown in BDT._
- [x] **8.3 [C]** `/consultation/doctor/[id]`: profile, available-slots calendar (from 5.9), reviews and a Book button.
  - _Done: profile header with availability, stars and a fee box with Book, free slots grouped by day, star reviews, About card._
- [x] **8.4 [C]** Decide what to do with `diagnostics`, `health-plans`, `medicine` and `ngos`: build them or **remove** them from the nav. Don't ship empty pages.
  - _Done: removed diagnostics, health-plans, medicine and ngos (no backend, nothing linked to them)._

### Patient (`/dashboard`)
- [x] **8.5 [C]** Dashboard home: upcoming appointment card, quick actions and stats.
  - _Done: stats (upcoming, prescriptions, total paid), next appointment card (Join / Pay / waiting room), quick actions._
- [x] **8.6 [C]** `/dashboard/my-appointments`: tabs for upcoming, past and cancelled.
  - Actions: pay now, cancel, reschedule, join call, view prescription, leave review.
  - Move the list that is currently on `/dashboard/page.tsx` here.
  - _Done: Upcoming / Past / Cancelled tabs (in the URL), with join call, waiting room, pay now, reschedule (doctor's free slots), cancel with reason (refund note), prescription PDF, invoice and review. Cancel/reschedule are offered until 2 h before the start (API rule). The old list was moved off /dashboard._
- [x] **8.7 [C]** Book appointment flow: pick doctor → pick slot → choose pay now or pay later → confirmation page.
  - _Done (already worked; checked): doctor → slot modal → confirmation with pay now / pay later → result banner._
- [x] **8.8 [C]** `/dashboard/health-records`: health data form and medical report upload, list and delete.
  - _Done: health data form (required fields on the first save, server now checks them too; field length limits), report upload/list/delete with a confirm dialog. Fixed dates of birth being stored one day early (UTC+ servers)._
- [x] **8.9 [C]** `/my-profile`: view and edit the profile and photo.
  - _Done: new GET/PATCH /profile/me for every role (photo upload, role-specific fields, unknown/other-role fields rejected); profile form with field errors; doctors also see fee, registration no., rating and specialties._

### Doctor (`/doctor/dashboard`)
- [x] **8.10 [C]** Dashboard home: today's appointments, earnings and rating.
  - _Done with 8.D5._
- [x] **8.11 [C]** Appointments: list with filters. Actions: start, complete, cancel, join call and write prescription.
  - _Done: Today / Upcoming / Past / Cancelled tabs, patient filter (also fed by the navbar search), Start/Rejoin call, Complete, Write prescription, Prescription PDF, No-show (15 min after start) and Cancel with a reason (refund for paid bookings)._
- [x] **8.12 [C]** My schedules: calendar view, plus picking and removing slots (with the 2.19 fix).
  - _Done: week calendar (Sunday start, prev/next/this week) loading one week via schedule.startDateTime[gte/lt]; open slots are green and removable, booked ones blue and locked; Calendar/List switch in ?view=; Book Schedule from both views._
- [x] **8.13 [C]** My reviews and prescriptions pages.
  - _Done: My Reviews with average, star breakdown and list; prescription list (doctor and patient) with a medicine table, follow-up date, PDF button, empty and error states._

### Admin (`/admin/dashboard`)
- [x] **8.14 [C]** Patients management: list, view and block/unblock.
  - _Done: GET /patients (admin; account status and counts, no medical data); list with search, status filter, sorting, pages; block / unblock with confirm (blocking signs the user out)._
- [x] **8.15 [C]** Admins management (SUPER_ADMIN only): create, edit and delete admins, and change roles.
  - _Done: super admins only (page checks the role, API too): list, create (must change password on first login), edit name/phone, change role, block / unblock, remove; your own row and super admins are protected._
- [x] **8.16 [C]** Specialties management: create with an icon, edit and soft-delete.
  - _Done: soft delete now (was a hard delete that also stripped the specialty from every doctor), PATCH /specialties/:id with icon upload, duplicate titles 409, re-creating a removed title restores it; card grid with create / edit / remove._
- [x] **8.17 [C]** Doctor specialties and doctor schedules management pages.
  - _Done: doctor specialties page (tick/untick per doctor), doctor schedules page (all doctors, open/booked filter, slot date range); admin schedule list no longer includes full doctor records._
- [x] **8.18 [C]** Appointments management: list, filter, view and cancel with refund.
  - _Done: GET /appointments (admin) with search, status, payment and slot-date filters; cancel with reason (refund for paid bookings); invoice link._
- [x] **8.19 [C]** Payments management: list, filter, view invoices and refund.
  - _Done: GET /payments (admin) with a fixed column allowlist (no gateway data / checkout links); status, amount and paid-date filters; invoice link; refund = cancel a paid booking that has not happened yet._
- [x] **8.20 [C]** Prescriptions and reviews management: list, view and moderate (hide abusive reviews).
  - _Done: review moderation (isHidden + reason; hidden reviews leave the public profile and the rating, recomputed in the same transaction); admin prescription list is metadata only (no medicines / PDF link)._
- [x] **8.21 [C]** Use the unused `dashboardData` in the dashboard home charts (`admin/dashboard/page.tsx:20`).
  - _Done: admin home uses all dashboardData (4 stat cards, bar and pie charts in the design palette)._

### Quality for every page
- [x] **8.22 [C]** Every data page has a loading skeleton, an empty state, an error state with a retry button, and toast messages for mutations.
  - _Done: skeletons on every dashboard loading.tsx, ErrorState (retry) / EmptyState across pages, dashboard-level error.tsx that keeps the shell, restyled root error / 404 / loading, toasts on all mutations._
- [x] **8.23 [C]** Every form:
  - uses the **same zod schema rules** as the server;
  - disables the submit button while sending;
  - shows field errors.
  - _Done: forms use the server rules (shared password schema, doctor designation 5+ and fee 50 to 1,000,000 whole taka, profile / health / admin / specialty / review / prescription schemas mirror the API); submit disabled while sending; field errors shown._
- [x] **8.24 [C]** After every mutation, invalidate the related TanStack Query keys so lists refresh.
  - _Done: mutations invalidate their own and related keys (doctor changes refresh doctor-specialties, doctor-schedules and dashboard numbers; schedule changes refresh slot pickers; appointment changes refresh the bell)._
- [x] **8.25 [C]** Fix `UserDropdown` markup (items inside the separator, `Link` without `asChild`) and use stable React `key`s instead of the array index.
  - _Done: UserDropdown rebuilt (grouped items, Link via asChild, shared useLogout); nav keys use href/title._
- [x] **8.26 [C]** Make it responsive: test every page at 375 px (phone), 768 px (tablet) and desktop.
  - _Done: scripted check of every page for horizontal overflow at 375 px (all roles) and 768 px; fixed grid overflow on narrow screens; the mobile drawer replaces the sidebar below md._
- [x] **8.27 [C]** Accessibility:
  - labels on all inputs;
  - keyboard navigation in dialogs;
  - colour contrast of at least 4.5:1;
  - `alt` text on images.
  - _Done: scripted check for unlabeled inputs, unnamed buttons/links and images without alt (fixed the table search box and its clear button); dialogs trap focus, close on Escape and return focus; colour tokens tuned so every text/background pair is at least 4.5:1 in light and dark._
- [x] **8.28 [C]** Import only the lucide icons you use in `iconMapper.ts`, instead of `import * as Icons`, to cut bundle size.
  - _Done: explicit icon map in iconMapper.ts._
- [x] **8.29 [C]** Remove all `console.log` calls (about 40) and add an ESLint `no-console` rule.
  - _Done: no console.log left; ESLint no-console (error/warn allowed); the API wrappers no longer log whole axios errors (they include session cookies), httpClient logs method, path and status only._

**Phase done when:** every link in every role's sidebar opens a working page, and a full click-through shows no placeholder text.

---

## Phase 9: Platform security hardening

**Goal:** a defense-in-depth setup that follows the OWASP Top 10.

### Server
- [x] **9.1 [S]** Add `helmet()` with sensible defaults.
  - _Done: helmet with a strict API CSP (default-src none, frame-ancestors none), HSTS in production, x-powered-by off._
- [x] **9.2 [S]** Add rate limiting with `express-rate-limit`, using a Redis store when there is more than one instance:
  - login, register and OTP endpoints: 5 requests per minute per IP and per email;
  - forgot/reset password: 3 requests per 15 minutes;
  - the general API: 100 requests per minute per user;
  - booking: 10 requests per minute per user.
  - _Done (in-memory store, one instance): auth 5/min per email + 100/min per IP, forgot/reset 3/15 min per email, API 100/min per session (1000 shared for anonymous traffic, which all comes from the Next.js server IP), booking 10/min per session. TRUST_PROXY sets proxy hops. Add a Redis store before running more than one instance. Proven by a script (6th login, 4th reset, 11th booking -> 429)._
- [x] **9.3 [S]** Put the better-auth handler (`/api/auth/*`) **before** `express.json()`, as its docs require (`server/src/app.ts:47`). Make the `/api/v1/auth/*` wrappers go through rate limiting.
  - _Done: better-auth stays before express.json(); the /api/v1/auth wrappers now have the limits above._
- [x] **9.4 [S]** Configure CORS with an **exact allowlist** from env (`FRONTEND_URL` only in production) and `credentials: true`. Never use `*`.
  - _Done: exact origin allowlist (FRONTEND_URL; localhost dev origins only outside production), credentials, X-Request-Id exposed._
- [x] **9.5 [S]** Protect against CSRF:
  - use `SameSite=Lax` cookies;
  - remove `express.urlencoded` if nothing needs it;
  - check that the `Origin` or `Referer` header matches the allowlist on every state-changing request.
  - _Done: SameSite=Lax cookies (already), express.urlencoded removed, Origin/Referer check on every POST/PUT/PATCH/DELETE (foreign origin -> 403; tested)._
- [x] **9.6 [S]** Limit request size to `express.json({ limit: "100kb" })`.
  - _Done: 100 kb JSON limit; over-limit -> 413 and bad JSON -> 400 (were 500)._
- [x] **9.7 [S]** File uploads:
  - allowlist MIME types (jpg, png, webp, pdf) **and check the file's magic bytes**;
  - a maximum of 5 MB per file and 5 files;
  - random file names;
  - clean up on every upload type, including `fields()` and arrays (`deletedUploadedFilesFromGlobalErrorHandler.ts:11,18`).
  - _Done: files held in memory, MIME + extension + magic-byte check (JPG/PNG/WEBP/PDF), 5 MB, 5 files, random UUID names, nothing stored on rejection; fake PNG and SVG-as-PNG rejected in tests; Cloudinary delete now handles every resource type._
- [x] **9.8 [S]** Validate env vars at startup with a zod schema that includes `DATABASE_URL`. Remove unused keys:
  - `JWT_SECRET_KEY`, `JWT_EXPIRES_IN`
  - `BETTER_AUTH_SESSION_TOKEN_*`
  - `GOOGLE_CALLBACK_URL`
  - the duplicate `BETTER_AUTH_URL`
  - _Done: zod schema for all env vars incl. DATABASE_URL, URLs, durations, Stripe key format; JWT_SECRET_KEY, JWT_EXPIRES_IN and GOOGLE_CALLBACK_URL no longer required (BETTER_AUTH_SESSION_TOKEN_* are still used). The duplicate BETTER_AUTH_URL line in .env should be deleted by hand._
- [ ] **9.9 [S]** Secrets:
  - at least 32 random bytes each;
  - different secrets for access tokens, refresh tokens and better-auth;
  - different values per environment;
  - kept in the hosting provider's secret store, not in a `.env` file in production.
  - _Partly: production refuses to start with secrets under 32 characters or reused ones. Still to do by you: ACCESS_TOKEN_SECRET (29) and REFRESH_TOKEN_SECRET (30) are short; replace them (same ACCESS_TOKEN_SECRET in client/.env) and use the host's secret store in production._
- [x] **9.10 [S]** Error responses: one consistent shape `{ success, message, errorSources }`, with no stack traces or DB details in production.
  - _Done: every error is { success, message, errorSources }, including 404, 429, CSRF and better-auth blocks; no stack or DB details outside development; the 404 no longer echoes the URL._
- [x] **9.11 [S]** Use a structured logger (`pino`) with a request id and **redaction** of these fields: `password`, `token`, `cookie`, `authorization`, `otp`, `email`, `contactNumber`.
  - _Done: pino + pino-http, request id (X-Request-Id), redaction of cookie, authorization, password, token, otp, email, contactNumber; request logs keep only method, path and status; server.ts and cron use the logger._
- [x] **9.12 [S]** Parse query params safely: `QueryBuilder` must not turn numeric strings into numbers for string fields such as `contactNumber`. Allowlist `sortBy`, `fields` and `include` per model.
  - _Done: text columns (names ending in Number, Id, email, name, phone...) are never parsed as numbers/booleans; sortBy only from the list's fields; ?fields= ignored unless a list sets selectableFields._
- [x] **9.13 [S]** Run `npm audit` and fix high and critical issues. Turn on Dependabot or Renovate. Move `express` and `@types/*` to the correct dependency groups.
  - _Done: npm audit fix, cloudinary 2 and nodemailer 10, express moved to dependencies and @types to devDependencies, Dependabot config. Left: 4 high findings inside the Prisma CLI (deepmerge-ts, mysql2); the only fix is a downgrade to Prisma 6, and it is build-time tooling the running API does not call._

### Client
- [x] **9.14 [C]** Set security headers in `next.config.ts`:
  - a `Content-Security-Policy` that allows your API, Stripe, Cloudinary and the video provider;
  - `X-Frame-Options: DENY` (except the video page if the provider needs it);
  - `Referrer-Policy: strict-origin-when-cross-origin`;
  - `Permissions-Policy` allowing camera and microphone only on the call page;
  - `Strict-Transport-Security`.
  - _Done: per-request CSP with nonce + strict-dynamic in proxy.ts (Cloudinary images, Daily.co frames), X-Frame-Options DENY, Referrer-Policy, Permissions-Policy (camera / mic only on the call page, delegated to Daily), HSTS in production; theme and query-hydration scripts get the nonce; checked in dev and production builds with no violations._
- [x] **9.15 [C]** Never render user HTML with `dangerouslySetInnerHTML`. Escape review and prescription text.
  - _Done: no dangerouslySetInnerHTML anywhere; reviews and prescriptions render as text._
- [x] **9.16 [C]** URL-encode every dynamic value in URLs (`encodeURIComponent`), for example emails in redirect URLs (`login/_action.ts:36,61`).
  - _Done: all dynamic URL values encoded (emails already were; ids now too)._
- [x] **9.17 [C]** Only `NEXT_PUBLIC_API_BASE_URL` may be public. Keep `ACCESS_TOKEN_SECRET` server-only, and consider removing it from the client entirely by trusting `/auth/me` instead.
  - _Done: only NEXT_PUBLIC_API_BASE_URL is public; ACCESS_TOKEN_SECRET is read only in proxy.ts (server-side)._
- [x] **9.18 [C]** Move `@types/jsonwebtoken` to devDependencies, run `npm audit` and turn on Dependabot.
  - _Done: @types and devtools moved to devDependencies, Next.js 16.3.8 (critical fix), 0 vulnerabilities, Dependabot config._

**Phase done when:** an OWASP ZAP baseline scan (or similar) against staging shows no High findings, and the rate limits are proven by a test.

---

## Phase 10: Medical data protection and privacy

**Goal:** patient health data is treated as sensitive, following HIPAA/GDPR-style practice.

- [x] **10.1 [S]** Make medical reports, prescriptions and invoices **private**: upload them to Cloudinary as `type: "authenticated"` (or to S3 private storage). Serve them only through **signed URLs that expire** (for example after 5 minutes), from an endpoint that checks ownership.
  - _Done: reports, prescription PDFs and invoices are uploaded as Cloudinary `authenticated` files under random names; the DB holds a `private:` reference and the API never returns it. `GET /api/v1/files/{reports|prescriptions|invoices}/:id` checks ownership (404 for others) and returns a 5-minute signed URL; the web app opens `/files/...`, which redirects (no-store, no-referrer). Emails link to the dashboard instead of the file. Proven: unsigned URL -> 401, signed -> 200, same link after expiry -> 401._
- [x] **10.2 [S]** Add an **audit log** table (`AuditLog`: who, what action, which record, when, IP). Record:
  - logins and failed logins;
  - role and status changes;
  - every read of medical reports or prescriptions;
  - refunds;
  - admin deletes.
  - _Done: `audit_logs` table and `audit()` helper (actor, role, action, record, IP, request id; never throws). Logged: login / failed login (no email stored), logout, password change/reset, status and role changes, every file read, data export, account deletion, refunds, review visibility, admin deletes._
- [x] **10.3 [S]** Use soft delete everywhere for users, doctors, specialties and appointments. Every query filters `isDeleted: false`, ideally through a Prisma client extension so no query can forget it.
  - _Done: Prisma client extension adds `isDeleted: false` to reads of Doctor, Patient, Admin, SuperAdmin and Specialty (`INCLUDE_DELETED` opts out). Users use `status`; appointments are cancelled, never deleted._
- [x] **10.4 [S]** Encrypt the most sensitive columns (for example health conditions and allergies) at the application level, or at least make sure the DB disk and backups are encrypted.
  - _Done: AES-256-GCM (`DATA_ENCRYPTION_KEY`, `enc:v1:` format) for prescription instructions and medicines, health-data free text and report names. Back up the key in the secret store: data cannot be read without it. `npm run data:encrypt-existing` encrypts older rows._
- [x] **10.5 [S]** Support data export and deletion requests: a patient can download their data, and request account deletion, which anonymizes personal data while keeping financial records.
  - _Done: "Your data" card on My Profile: Download my data (JSON file) and Delete my account (password, or "DELETE" for Google accounts; refused while an appointment is upcoming). Deletion removes health data, reports and files, anonymizes the patient and user, ends sessions, and keeps appointments, prescriptions and payments as anonymous records._
- [x] **10.6 [S]** Data retention: write down how long you keep logs, appointments and medical files, and automate cleanup where it is allowed.
  - _Done: written in `server/docs/data-retention.md`. A daily job (03:30) removes expired sessions and codes, webhook events after 90 days, audit logs after 6 years and never-verified empty accounts after 30 days._
- [x] **10.7 [C]** Pages and consent:
  - add privacy policy and terms pages;
  - add a consent checkbox at register;
  - add a cookie notice if you use analytics.
  - _Done: `/privacy` and `/terms` pages (linked in the footer and the register form); register requires the consent checkbox and stores `termsAcceptedAt` + `termsVersion`. No cookie notice: there is no analytics, only essential cookies._
- [x] **10.8 [S+C]** Never put personal or health data in URLs, logs, analytics events or error-tracking payloads. Configure Sentry to scrub it.
  - _Done: emails are no longer passed in `?email=` (short-lived httpOnly cookie instead); file links carry only record ids; pino redacts cookies, auth headers, passwords and bodies; audit rows hold ids, not emails. Sentry is not installed yet; its scrubbing is part of 13.10._

**Phase done when:** a medical report URL copied from the browser stops working after it expires, and every read of it appears in the audit log.

---

## Phase 11: Testing

**Goal:** important flows are tested automatically, and you catch breakages before users do.

### Server (Vitest + Supertest + a real test Postgres)
- [x] **11.1 [S]** Set up Vitest and a test DB using Docker or Testcontainers. Reset the DB between test files. Add an `npm test` script.
  - _Done: Vitest 5 (`npm test`, `test:coverage`, `test:types`). Instead of Docker/Testcontainers (no Docker here) `tests/globalSetup.ts` starts a throwaway PostgreSQL from the `embedded-postgres` binaries on a free port, migrates it and deletes it afterwards; every test file starts with empty tables. Fake config in `tests/test.env`; see `server/docs/testing.md`._
- [x] **11.2 [S]** Add test factories that create a user, patient, doctor, admin, schedule and appointment.
  - _Done: `tests/helpers/factories.ts` (patient, doctor, admin, super admin with real password hashes; slots; appointments + payments)._
- [x] **11.3 [S]** Auth tests:
  - register, verify, login, refresh, refresh-token reuse detection, logout, change password and reset password;
  - a blocked user is rejected;
  - an unverified user is rejected.
  - _Done: `auth.test.ts` (19 tests), incl. lockout after 5 wrong passwords, tampered/foreign tokens and expired sessions._
- [x] **11.4 [S]** Permission tests: generate one test per row of the permission matrix (4.1), covering every role on every endpoint plus an IDOR attempt.
  - _Done: `permissions.test.ts`: every route × 4 roles + anonymous (78 routes), a check that the matrix lists every route in the route files, and IDOR attempts (appointments, files, prescriptions, reviews, doctor profile). Logout and the 3 Google redirects are listed but not called._
- [x] **11.5 [S]** Booking tests:
  - concurrent booking (20 parallel requests give exactly 1 success);
  - past slot;
  - deleted doctor;
  - overlapping appointments;
  - pay later.
  - _Done: `booking.test.ts`: 20 parallel requests → exactly 1 × 201 and 19 × 409; plus unpaid limit, Idempotency-Key, Stripe down (slot given back) and reschedule._
- [x] **11.6 [S]** State machine tests: every allowed and disallowed transition.
  - _Done: `state-machine.test.ts`: every status × status × actor against the documented table (113 tests), the time/payment rules, and the HTTP endpoint (slot release, refund first, 502 leaves everything unchanged)._
- [x] **11.7 [S]** Payment tests: webhook with a valid and an invalid signature, a duplicate event, a late payment that is auto-refunded, and an expired session. Mock Stripe.
  - _Done: `payments.test.ts` + `invoices.test.ts`: real Stripe signatures with mocked network calls; duplicate events, late payment → refund, retry after a temporary failure, expired sessions (pay now / pay later), dashboard refunds, invoices, reconciliation._
- [x] **11.8 [S]** Cron tests: only expired unpaid appointments are cancelled, and a slot that someone else re-booked is not released.
  - _Done: `cron.test.ts`: only expired unpaid appointments are cancelled, a re-booked slot stays booked, two servers at once cancel each appointment once; reminders are sent once._
- [x] **11.9 [S]** Validation tests: unknown fields are rejected (`.strict()`), the size limits work and bad JSON returns 400.
  - _Done: `validation.test.ts`: unknown and nested unknown fields → 400, 413 for bodies > 100 kB and files > 5 MB, file content checks, bad JSON → 400, CSRF origin check._

### Client
- [x] **11.10 [C]** Unit tests with Vitest + React Testing Library for:
  - `authUtils` (redirect validation and route owner);
  - the zod schemas;
  - the login and register forms.
  - _Done: Vitest + React Testing Library in the client (`npm test`): authUtils (open redirects, route owners), the zod schemas, LoginForm and RegisterForm (server actions mocked)._
- [x] **11.11 [C]** Proxy tests: every role on every route group, with expired, missing and invalid tokens.
  - _Done: `tests/unit/proxy.test.ts` (41 tests): anonymous + 4 roles on 6 route groups; forged, tampered, expired, expiring and missing tokens; refresh success / rejected / API down; forced password change; CSP nonce._
- [x] **11.12 [C]** End-to-end tests with Playwright against the local server and a test DB:
  - patient: register → verify → book → pay (Stripe test card) → see the appointment;
  - doctor: log in → pick slots → start → complete → write prescription;
  - admin: create doctor → create schedule → view payments;
  - security: a patient opening `/admin/dashboard` is redirected.
  - _Done: `client/tests/e2e` (7 tests, `npm run test:e2e`). Playwright starts `server/scripts/e2e-server.ts`: throwaway Postgres, the real API, a local fake Stripe Checkout (test card page that sends a signed webhook) and Daily.co, and an email outbox for the codes. The real Stripe Checkout page is not driven (that needs real keys + the Stripe CLI); real Stripe was tested by hand on 2026-10-01. CI workflows are written for both repos but have not run yet._
- [x] **11.13 [S+C]** Coverage goal: at least 80 % on the auth, appointment and payment services. Don't chase 100 % elsewhere.
  - _Done (enforced by `test:coverage`): auth.service 80.8 %, appointment.service 81.5 %, payment.service 91.1 % of lines; state machine and reminders 100 %._

**Phase done when:** `npm test` passes in both repos, and the E2E suite passes locally and in CI.

---

## Phase 12: Performance and data quality

- [ ] **12.1 [S]** Add DB indexes for real query patterns:
  - `Appointment(patientId, status)`, `Appointment(doctorId, status)`;
  - `Schedule(startDateTime)`;
  - `Payment(status)`;
  - `Doctor(isDeleted)`.
  - Check slow queries with `EXPLAIN ANALYZE`.
- [ ] **12.2 [S]** Remove N+1 queries and huge includes. List endpoints should `select` only the columns the UI shows.
- [ ] **12.3 [S]** Keep heavy work (PDF, email, Cloudinary upload) out of request/response handlers. Use a job queue such as BullMQ + Redis with retries.
- [ ] **12.4 [S]** Cache the public doctor list and specialties for a short time (60 s) using Redis or HTTP cache headers.
- [ ] **12.5 [C]** Use Server Components for read-only pages, `next/image` for photos (configure Cloudinary `remotePatterns`), and dynamic import for charts.
- [ ] **12.6 [C]** Set a sensible TanStack Query `staleTime`, and don't refetch on every window focus for admin tables.
- [ ] **12.7 [S]** Seed data script for development: 10 specialties, 20 doctors, schedules for the next 14 days and sample patients. Never run it in production.

---

## Phase 13: DevOps, deployment and monitoring

### Docker
- [ ] **13.1 [S]** Make the server Dockerfile multi-stage:
  - `deps` → `build` (`prisma generate` + `tsc`) → `runtime` (`node:22-alpine`, production deps only);
  - run as the **non-root** `node` user;
  - `CMD ["node", "dist/server.js"]`;
  - fix the missing `prisma:generate` script.
- [ ] **13.2 [S]** Run migrations with `prisma migrate deploy` as a separate step or job before the app starts. Never use `migrate dev` or `db push` in production.
- [ ] **13.3 [C]** Make the client Dockerfile multi-stage with `output: "standalone"` in `next.config.ts`:
  - `next build` in the build stage, `node server.js` at runtime;
  - non-root user;
  - no `npm install` in `CMD`.
- [ ] **13.4 [S+C]** Add a `docker-compose.yml` at `mission-6/` with Postgres, Redis, the server and the client for one-command local start-up.

### CI/CD (GitHub Actions)
- [ ] **13.5 [S+C]** On every PR: install → lint → type-check → test → build. Block the merge if anything fails.
- [ ] **13.6 [S+C]** Turn on secret scanning (`gitleaks`) and dependency audit in CI.
- [ ] **13.7 [S+C]** Use three environments, **dev**, **staging** and **production**, each with its own DB, Stripe keys and secrets. Deploy to staging automatically and to production manually.

### Operations
- [ ] **13.8 [S]** Add `GET /health` (the process is alive) and `GET /ready` (DB and Redis reachable), and use them in the hosting health checks.
- [ ] **13.9 [S]** Graceful shutdown on SIGTERM:
  - stop accepting new requests;
  - finish in-flight ones;
  - stop the cron;
  - `prisma.$disconnect()`;
  - exit.
- [ ] **13.10 [S+C]** Error tracking with Sentry (or similar) on both apps, with personal data scrubbing (10.8).
- [ ] **13.11 [S]** Uptime monitoring and alerts for: API down, webhook failures, cron failures, email failures and payment mismatches (6.9).
- [ ] **13.12 [S]** Automated daily DB backups with at least 7–30 days of retention. **Test a restore** at least once.
- [ ] **13.13 [S+C]** HTTPS everywhere. Redirect HTTP to HTTPS. Point the Stripe webhook at the production HTTPS URL.

---

## Phase 14: Launch checklist

Tick these on the **staging** environment right before you go live.

- [ ] **14.1** Every box in Phases 0–13 is ticked, or deliberately deferred with a written reason.
- [ ] **14.2** Production uses **live** Stripe keys, a fresh webhook secret, and secrets that are new and different from development.
- [ ] **14.3** The super admin password has been changed after the first login, and the seed is disabled.
- [ ] **14.4** `NODE_ENV=production`, no stack traces in responses and no `console.log` left.
- [ ] **14.5** CORS allows only the production frontend URL. Cookies are `secure`.
- [ ] **14.6** Full E2E run on staging passes, including a real Stripe test-mode payment and a refund.
- [ ] **14.7** Security scan (OWASP ZAP baseline) shows no High findings, and `npm audit` shows no High or Critical issues.
- [ ] **14.8** The backup restore has been tested, and the monitoring and alerts have fired at least once in a test.
- [ ] **14.9** Privacy policy, terms and the support contact are published.
- [ ] **14.10** A rollback plan is written down: the previous Docker image tag and how to roll back a migration safely.

---

## Notes and decisions log

Write down important decisions here so you remember why things are the way they are.

| Date | Decision | Reason |
|------|----------|--------|
| 2026-10-01 | Plan created from the full project review | — |
| | | |
