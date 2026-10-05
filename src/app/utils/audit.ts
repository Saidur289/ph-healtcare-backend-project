import { Prisma } from "../../generated/prisma/client";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { getRequestContext } from "./requestContext";

export type TAuditAction =
  | "auth.login"
  | "auth.login_failed"
  | "auth.logout"
  | "auth.password_changed"
  | "auth.password_reset"
  | "user.status_change"
  | "user.role_change"
  | "user.account_deleted"
  | "user.data_export"
  | "file.read"
  | "patient.medical_history_read"
  | "payment.refund"
  | "appointment.cancel"
  | "review.visibility_change"
  | "admin.delete";

type TActor = { userId?: string | null; role?: string | null } | null | undefined;

// Never throws: a failed audit write is logged but must not break the user's request.
// meta must not contain medical content or personal data (ids and small labels only).
export const audit = async (input: {
  action: TAuditAction;
  actor?: TActor;
  entityType?: string;
  entityId?: string | null;
  meta?: Record<string, unknown>;
}) => {
  const context = getRequestContext();
  const { ip, requestId } = context;
  // actor: given explicitly, otherwise the logged-in user of this request
  const actor = input.actor === undefined ? { userId: context.userId, role: context.role } : input.actor;
  try {
    await prisma.auditLog.create({
      data: {
        action: input.action,
        actorId: actor?.userId ?? null,
        actorRole: actor?.role ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        ip: ip?.slice(0, 64) ?? null,
        requestId: requestId?.slice(0, 64) || null,
        meta: (input.meta as Prisma.InputJsonValue) ?? undefined,
      },
    });
  } catch (error) {
    logger.error({ err: error, action: input.action }, "audit log write failed");
  }
};
