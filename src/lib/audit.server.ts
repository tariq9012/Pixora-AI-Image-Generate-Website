import { db } from "@/db/client.server";
import { auditLogs } from "@/db/schema";

export type AuditAction =
  | "PASSWORD_CHANGED"
  | "PASSWORD_RESET_COMPLETED"
  | "EMAIL_VERIFIED"
  | "EMAIL_CHANGE_REQUESTED"
  | "EMAIL_CHANGED"
  | "LOGOUT_ALL_SESSIONS"
  | "PROFILE_UPDATED"
  // Phase 13 (billing) additions.
  | "CHECKOUT_CREATED"
  | "SUBSCRIPTION_STARTED"
  | "SUBSCRIPTION_CANCELED"
  | "BILLING_PORTAL_OPENED";

/**
 * Thin wrapper around the audit_logs table (Phase 2). Never pass a
 * password, token, or other secret in `metadata` — only non-sensitive
 * context (e.g. which fields changed).
 */
export async function logAuditEvent(input: {
  actorUserId: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      actorUserId: input.actorUserId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata,
    });
  } catch (error) {
    // Auditing must never break the user-facing action it's logging.
    console.error("Failed to write audit log entry:", error);
  }
}
