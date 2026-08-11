import "server-only";

/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Logging seguro de eventos de entitlement (Fase 7A)
 * Descripcion: El repo no tiene un logger centralizado (unico precedente:
 * `sanitize()` en lib/admin-audit.ts, acoplado a la tabla admin_audit_log).
 * Este modulo es la version standalone para `console.*`. Solo acepta un
 * conjunto CERRADO de campos seguros (status HTTP, decision, latencia,
 * cache hit/miss, categoria de error) -- nunca recibe ni el header
 * Authorization ni el token ni el body crudo de Control. La sanitizacion
 * por regex es una segunda capa de defensa, no la unica.
 * Seguridad: no incluir claves ni datos sensibles en este archivo.
 */

const SECRET_KEY_PATTERN = /(authoriz|bearer|token|secret|password|passwd|key|cookie)/i;

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !SECRET_KEY_PATTERN.test(key))
        .map(([key, child]) => [key, sanitize(child)])
    );
  }
  return value;
}

export type EntitlementLogEvent = {
  event: "check";
  decision: "ALLOW" | "DENY";
  reason: string;
  latencyMs: number;
};

export function logEntitlementEvent(event: EntitlementLogEvent): void {
  // Unico mecanismo de logging disponible hoy en el repo (ver auditoria
  // previa a esta fase: no existe un logger estructurado centralizado).
  console.info("[entitlement]", JSON.stringify(sanitize(event)));
}
