import "server-only";

/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Mock de la entitlement API para dev/test (Fase 7A)
 * Descripcion: Fixtures explicitas de los 5 estados autoritativos (ACTIVO,
 * OVERDUE, GRACE_PERIOD, SUSPENDED, CANCELLED). Permiten desarrollar/probar
 * Perfume Store sin depender de un Riedmann Apps Control remoto real
 * (seccion 33 del encargo) y sin requerir un installation token real
 * (seccion 34). El modo mock por variable de entorno NUNCA se activa en
 * produccion, ni siquiera si alguien deja la variable puesta por error --
 * es un cortocircuito de seguridad deliberado, no solo una recomendacion.
 * Seguridad: no incluir claves ni datos sensibles en este archivo.
 */

import { isProductionRuntime } from "./config";
import type { EntitlementCheckResponse } from "./schema";

export type MockStatusKey = "ACTIVE" | "OVERDUE" | "GRACE_PERIOD" | "SUSPENDED" | "CANCELLED";

const MOCK_STATUS_KEYS: readonly MockStatusKey[] = ["ACTIVE", "OVERDUE", "GRACE_PERIOD", "SUSPENDED", "CANCELLED"];

function isMockStatusKey(value: string): value is MockStatusKey {
  return (MOCK_STATUS_KEYS as readonly string[]).includes(value);
}

function buildFixture(status: MockStatusKey, checkedAt: string): EntitlementCheckResponse {
  const base = {
    scope: "ADMIN" as const,
    checkedAt,
    recheckAfterSeconds: 60
  };

  switch (status) {
    case "ACTIVE":
      return { ...base, decision: "ALLOW", status: "ACTIVE", suspensionScope: null, notice: null };
    case "OVERDUE":
      return { ...base, decision: "ALLOW", status: "OVERDUE", suspensionScope: null, notice: null };
    case "GRACE_PERIOD":
      return {
        ...base,
        decision: "ALLOW",
        status: "GRACE_PERIOD",
        suspensionScope: null,
        notice: {
          severity: "warning",
          code: "GRACE_PERIOD",
          title: "Mensualidad pendiente",
          message: "Regulariza el pago para evitar la suspensión del servicio."
        }
      };
    case "SUSPENDED":
      return { ...base, decision: "DENY", status: "SUSPENDED", suspensionScope: "ADMIN_ONLY", notice: null };
    case "CANCELLED":
      return { ...base, decision: "DENY", status: "CANCELLED", suspensionScope: "ADMIN_ONLY", notice: null };
  }
}

/** Fixtures reutilizables por tests unitarios/integracion (una por cada estado autoritativo del contrato). */
export const MOCK_ENTITLEMENT_RESPONSES: Readonly<Record<MockStatusKey, EntitlementCheckResponse>> = {
  ACTIVE: buildFixture("ACTIVE", "2026-01-01T00:00:00.000Z"),
  OVERDUE: buildFixture("OVERDUE", "2026-01-01T00:00:00.000Z"),
  GRACE_PERIOD: buildFixture("GRACE_PERIOD", "2026-01-01T00:00:00.000Z"),
  SUSPENDED: buildFixture("SUSPENDED", "2026-01-01T00:00:00.000Z"),
  CANCELLED: buildFixture("CANCELLED", "2026-01-01T00:00:00.000Z")
};

/**
 * Modo mock explicito por variable de entorno, para levantar `npm run dev`
 * localmente sin token real. Gateado a `NODE_ENV !== "production"` como
 * defensa en profundidad -- no depende solo de que alguien recuerde borrar
 * la variable antes de desplegar.
 */
export function getMockEntitlementResponse(): EntitlementCheckResponse | null {
  if (isProductionRuntime()) return null;

  const raw = process.env.RIEDMANN_APPS_MOCK_STATUS?.trim().toUpperCase();
  if (!raw || !isMockStatusKey(raw)) return null;

  return buildFixture(raw, new Date().toISOString());
}
