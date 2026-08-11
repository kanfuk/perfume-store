import "server-only";

/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Punto de entrada publico del gate de entitlement admin (Fase 7A)
 * Descripcion: UNICA funcion que el resto de la app debe llamar (hoy:
 * app/admin/layout.tsx). Todo lo demas en lib/entitlements/ es detalle de
 * implementacion. Nunca lanza: en el peor caso devuelve fail-open
 * (blocked:false). Ver docs/RIEDMANN_APPS_ENTITLEMENT_INTEGRATION.md.
 * Seguridad: no incluir claves ni datos sensibles en este archivo.
 */

import { evaluateAdminEntitlement, type AdminEntitlementDecision } from "./policy";
import { logEntitlementEvent } from "./logging";

export type { AdminEntitlementDecision, AdminEntitlementReason } from "./policy";
export type { EntitlementNoticePayload } from "./schema";

export async function getAdminEntitlement(): Promise<AdminEntitlementDecision> {
  const startedAt = Date.now();
  const decision = await evaluateAdminEntitlement();

  logEntitlementEvent({
    event: "check",
    decision: decision.blocked ? "DENY" : "ALLOW",
    reason: decision.reason,
    latencyMs: Date.now() - startedAt
  });

  return decision;
}
