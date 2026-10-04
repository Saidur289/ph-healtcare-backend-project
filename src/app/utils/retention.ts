import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";

// Automated part of docs/data-retention.md. Runs daily (app.ts). Each rule only removes data
// that has no legal or medical reason to be kept.
const DAY = 24 * 60 * 60 * 1000;
export const RETENTION = {
  expiredSessionsAfterDays: 7, // sessions / verification codes after they expire
  webhookEventsDays: 90, // Stripe event ids (only needed to ignore duplicates)
  auditLogDays: 6 * 365, // audit trail: 6 years
  unverifiedAccountsDays: 30, // sign-ups that never confirmed their email
};

export const runRetentionCleanup = async () => {
  const now = Date.now();
  const before = (days: number) => new Date(now - days * DAY);
  const [sessions, verifications, events, audits, unverified] = await Promise.all([
    prisma.session.deleteMany({ where: { expiresAt: { lt: before(RETENTION.expiredSessionsAfterDays) } } }),
    prisma.verification.deleteMany({ where: { expiresAt: { lt: before(RETENTION.expiredSessionsAfterDays) } } }),
    prisma.stripeWebhookEvent.deleteMany({ where: { createdAt: { lt: before(RETENTION.webhookEventsDays) } } }),
    prisma.auditLog.deleteMany({ where: { createdAt: { lt: before(RETENTION.auditLogDays) } } }),
    // never-verified patients with no appointments at all (cascade removes the empty profile)
    prisma.user.deleteMany({
      where: {
        emailVerified: false,
        role: "PATIENT",
        createdAt: { lt: before(RETENTION.unverifiedAccountsDays) },
        Patient: { appointments: { none: {} } },
      },
    }),
  ]);
  logger.info(
    { sessions: sessions.count, verifications: verifications.count, webhookEvents: events.count, auditLogs: audits.count, unverifiedAccounts: unverified.count },
    "retention cleanup done",
  );
};
