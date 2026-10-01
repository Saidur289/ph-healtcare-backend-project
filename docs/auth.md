# How login and sessions work

**Source of truth = the better-auth session row in the database** (`session` table).
Our own JWTs are short-lived helpers that are always checked against that session.

## Cookies

| Cookie | What it is | Lifetime (from `.env`) | Set by |
|--------|-----------|------------------------|--------|
| `better-auth.session_token` | id of the DB session | `BETTER_AUTH_SESSION_TOKEN_EXPIRES_IN` (1d), slides on refresh, max 30 days | API (login, refresh, change password) |
| `accessToken` | JWT: userId, role, status, emailVerified, needPasswordChange, `sid` (session id) | `ACCESS_TOKEN_EXPIRES_IN` (**15m**) | API |
| `refreshToken` | JWT with a unique `jti`, bound to the same `sid` | `REFRESH_TOKEN_EXPIRES_IN` (7d) | API |

All three are `httpOnly`, `SameSite=Lax`, `Secure` in production. Tokens are **never** sent in JSON bodies.

The browser only talks to the Next.js app. The Next.js server calls the API and copies the
API's `Set-Cookie` headers onto its own domain (`client/src/lib/cookieUtils.ts` in server actions,
`client/src/proxy.ts` on refresh).

## Every protected API request (`checkAuth`)

1. Session cookie + access token cookie must be present → else **401**.
2. Session must exist in the DB and not be expired → else **401**.
3. Access token must be valid, and its `userId`/`sid` must match the session → else **401**.
4. User from the DB (not from the token): deleted/blocked → **403**, email not verified → **403**
   (except `checkAuthAllowUnverified` routes), wrong role → **403**.

## Refresh (`POST /auth/refresh-token`)

- Needs both cookies. Expired sessions are never revived.
- The refresh token must belong to the session (`sid`) and be **the latest one**: the session stores
  `refreshTokenHash` (sha256). A different, older token → all of the user's sessions are deleted
  (stolen token), except within 30 s of the last rotation (two tabs refreshing at once).
- Role and status are re-read from the DB, so a blocked/demoted user can't keep refreshing.
- The client proxy refreshes when the access token is missing, expired or has < 2 minutes left.

## Sessions are ended when

logout · password change (other devices) · password reset (all) · user blocked · role changed ·
admin/doctor deleted · refresh-token reuse detected.

## Abuse protection

- Login: 5 wrong passwords in 15 min → locked for 15 min (`utils/attemptLimiter.ts`, in memory).
- OTP: 6 digits, 10 min, 5 attempts, stored hashed; max 1 email per address per 60 s.
- Register / forgot password / resend OTP answer the same whether the email exists or not.
- better-auth's own HTTP endpoints are blocked except the Google login flow (`src/app.ts`).

## Known limits (see plan.md)

- Attempt counters live in memory: use Redis when running more than one server (9.2).
- Google login sets cookies on the API's domain. This works on `localhost`; in production the API and
  the frontend need a shared parent domain, or the Google callback must go through the Next.js app.
