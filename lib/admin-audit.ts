import crypto from "node:crypto";
import type { AuthenticatedAdmin } from "@/lib/admin-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const ADMIN_AUDIT_ACTIONS = [
  "PRODUCT_CREATED", "PRODUCT_UPDATED", "PRICE_CHANGED", "COST_CHANGED", "STOCK_CHANGED",
  "CATALOG_IMPORT", "BULK_IMAGE_UPLOAD", "ORDER_UPDATED", "PAYMENT_CONFIRMED",
  "CUSTOMER_UPDATED", "CUSTOMER_BLOCKED", "SETTINGS_UPDATED", "PAYMENT_ACCOUNT_UPDATED",
  "WEEKLY_CLOSURE", "COMMERCIAL_RESET", "ADMIN_INVITED", "ADMIN_DISABLED"
] as const;

export type AdminAuditAction = (typeof ADMIN_AUDIT_ACTIONS)[number];

const SECRET_KEY = /(password|passwd|jwt|access.?token|refresh.?token|service.?role|secret|authorization|cookie|bank|cuenta|rut)/i;

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !SECRET_KEY.test(key))
      .map(([key, child]) => [key, sanitize(child)])
  );
}

export async function logAdminAction(input: {
  actor: AuthenticatedAdmin | null;
  action: AdminAuditAction;
  entityType: string;
  entityId?: string | null;
  requestId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const actorRole = input.actor?.rol ?? "SYSTEM";
  const { error } = await createSupabaseServerClient().from("admin_audit_log").insert({
    actor_admin_id: input.actor?.profileId ?? null,
    actor_auth_user_id: input.actor?.userId ?? null,
    actor_role: actorRole,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    request_id: input.requestId && /^[0-9a-f-]{36}$/i.test(input.requestId) ? input.requestId : crypto.randomUUID(),
    before_snapshot: input.before === undefined ? null : sanitize(input.before),
    after_snapshot: input.after === undefined ? null : sanitize(input.after),
    metadata: sanitize(input.metadata ?? {})
  });

  if (error) throw new Error(`No fue posible registrar la actividad administrativa: ${error.message}`);
}

export function requestAuditId(request: Request): string {
  return request.headers.get("x-request-id") ?? crypto.randomUUID();
}

