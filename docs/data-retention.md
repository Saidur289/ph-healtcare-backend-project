# Data protection and retention

How PH Healthcare stores, protects and removes personal and health data.
The automated parts run every night at 03:30 (`src/app/utils/retention.ts`).

## What is sensitive and how it is protected

| Data | Where | Protection |
|------|-------|------------|
| Medical reports (files) | Cloudinary, `authenticated` type | Private: the plain URL returns 401. The database keeps a reference, never a link. Patients get a download link valid for 5 minutes from `GET /api/v1/files/reports/:id` (owner only). Every read is in the audit log. |
| Prescription PDFs | Cloudinary, `authenticated` | Same, `GET /api/v1/files/prescriptions/:id` (the patient or the prescribing doctor). Also attached to the email. |
| Invoices | Cloudinary, `authenticated` | Same, `GET /api/v1/files/invoices/:id` (the patient or an admin). |
| Health notes (diet, mental health history, vaccinations), report names, prescription instructions and medicines | Postgres | Encrypted by the app (AES-256-GCM, `DATA_ENCRYPTION_KEY`). |
| Other health fields (blood group, yes/no conditions, height, weight, date of birth) | Postgres | Disk and backup encryption of the database provider (Neon encrypts data at rest). |
| Everything else | Postgres | Disk and backup encryption; access only through the API's role checks. |

`DATA_ENCRYPTION_KEY` must be kept in the hosting provider's secret store and backed up. Without it the encrypted columns can't be read.

Admins never see health data or report files. The admin prescription list shows only who prescribed what and when (`prescription.service.ts`).

## Audit log (`audit_logs`)

Recorded: logins and failed logins, logouts, password changes and resets, role and status changes, every read of a medical report / prescription / invoice, refunds, review moderation, admin deletes, data exports and account deletions. Each entry stores who (user id and role), the action, the record (type and id), the IP and the request id, plus a few non-personal details. It never stores medical content or email addresses.

## Retention

| Data | Kept for | Then |
|------|----------|------|
| Expired sessions and verification codes | 7 days after they expire | deleted automatically |
| Stripe webhook event ids | 90 days | deleted automatically |
| Audit log | 6 years | deleted automatically |
| Accounts that never verified their email and have no appointments | 30 days | deleted automatically |
| Background jobs (`jobs`: invoice / prescription delivery, reminder emails; payloads can hold email addresses) | 7 days after they ran, 30 days if they failed | deleted automatically |
| Appointments, prescriptions, payments, invoices | At least 10 years (medical and financial records) | Reviewed by an admin; not deleted automatically |
| Medical reports uploaded by patients | Until the patient deletes them or their account | deleted with the account |
| Request logs (pino output) | Set by the log platform: keep 30 days | rotate / delete |

Check the retention periods with the clinic's legal advisor for the country where it operates.

## Patient rights

- **Export:** Profile → "Download my data" (`GET /api/v1/profile/me/export`): profile, health data, report list, appointments, prescriptions and reviews as JSON.
- **Deletion:** Profile → "Delete my account" (`DELETE /api/v1/profile/me`, password or the word DELETE for Google accounts). Not possible while an appointment is upcoming. Removes the health data, the medical reports (files too), the profile photo and the review texts; replaces the name and email with placeholders; deletes the login. Appointments, prescriptions and payments stay as anonymous records.
- **Consent:** the privacy policy and terms must be accepted at sign-up; the date and terms version are stored on the user (`termsAcceptedAt`, `termsVersion`).

## Personal data must never appear in

- URLs (no emails or names in query strings; the sign-up / reset flows keep the email in a short-lived cookie),
- logs (pino redacts cookies, authorization, passwords, tokens, codes, emails and phone numbers; request logs keep method, path and status only),
- analytics or error tracking (none is installed; if Sentry is added, enable `sendDefaultPii: false` and scrub request bodies, cookies and headers in `beforeSend`).

## One-off scripts

- `npm run files:make-private` moves files stored before this change to private storage.
- `npm run data:encrypt-existing` encrypts rows saved before encryption was added.
