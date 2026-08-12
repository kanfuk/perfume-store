import "server-only";

/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Contrato de la entitlement API de Riedmann Apps Control (Fase 7A)
 * Descripcion: Tipos + validador runtime manual del body de
 * POST /api/v1/entitlements/check. El repo no tenia ninguna dependencia de
 * validacion de schema (Zod/Yup/Ajv) antes de esta fase; se prefirio un
 * validador explicito y auditable, sin dependencia nueva, para un contrato
 * pequeno y estable en vez de traer una libreria para 8 campos.
 * Seguridad: no incluir claves ni datos sensibles en este archivo.
 */

export type EntitlementDecision = "ALLOW" | "DENY";
export type EntitlementStatus = "ACTIVE" | "OVERDUE" | "GRACE_PERIOD" | "SUSPENDED" | "CANCELLED";
export type SuspensionScope = "ADMIN_ONLY" | "WRITE_BLOCK" | "FULL_APP";

export type EntitlementNoticePayload = {
  severity: string;
  code: string;
  title: string;
  message: string;
};

export type EntitlementCheckResponse = {
  decision: EntitlementDecision;
  status: EntitlementStatus;
  scope: "ADMIN";
  suspensionScope: SuspensionScope | null;
  checkedAt: string;
  recheckAfterSeconds: number;
  notice: EntitlementNoticePayload | null;
};

const DECISIONS = new Set<string>(["ALLOW", "DENY"]);
const STATUSES = new Set<string>(["ACTIVE", "OVERDUE", "GRACE_PERIOD", "SUSPENDED", "CANCELLED"]);
const SUSPENSION_SCOPES = new Set<string>(["ADMIN_ONLY", "WRITE_BLOCK", "FULL_APP"]);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidNotice(value: unknown): value is EntitlementNoticePayload | null {
  if (value === null) return true;
  if (typeof value !== "object") return false;
  const notice = value as Record<string, unknown>;
  return (
    isNonEmptyString(notice.severity) &&
    isNonEmptyString(notice.code) &&
    isNonEmptyString(notice.title) &&
    isNonEmptyString(notice.message)
  );
}

/**
 * Valida el body crudo de la respuesta de Control contra el contrato
 * exacto de la seccion 7 del encargo. Devuelve null ante CUALQUIER
 * desviacion (campo faltante, tipo incorrecto, enum desconocido, notice mal
 * formado) -- nunca lanza, nunca confia parcialmente en un payload
 * malformado. El llamador (lib/entitlements/client.ts) trata un null como
 * "dependency-error" (fail-open transitorio), NUNCA como DENY autoritativo
 * (seccion 10/31 del encargo).
 */
export function parseEntitlementCheckResponse(payload: unknown): EntitlementCheckResponse | null {
  if (typeof payload !== "object" || payload === null) return null;
  const data = payload as Record<string, unknown>;

  if (!isNonEmptyString(data.decision) || !DECISIONS.has(data.decision)) return null;
  if (!isNonEmptyString(data.status) || !STATUSES.has(data.status)) return null;
  if (data.scope !== "ADMIN") return null;

  if (data.suspensionScope !== null && data.suspensionScope !== undefined) {
    if (!isNonEmptyString(data.suspensionScope) || !SUSPENSION_SCOPES.has(data.suspensionScope)) {
      return null;
    }
  }

  if (!isNonEmptyString(data.checkedAt) || Number.isNaN(Date.parse(data.checkedAt))) return null;

  if (
    typeof data.recheckAfterSeconds !== "number" ||
    !Number.isFinite(data.recheckAfterSeconds) ||
    data.recheckAfterSeconds <= 0
  ) {
    return null;
  }

  if (!("notice" in data) || !isValidNotice(data.notice)) return null;

  return {
    decision: data.decision as EntitlementDecision,
    status: data.status as EntitlementStatus,
    scope: "ADMIN",
    suspensionScope: (data.suspensionScope ?? null) as SuspensionScope | null,
    checkedAt: data.checkedAt,
    recheckAfterSeconds: data.recheckAfterSeconds,
    notice: (data.notice ?? null) as EntitlementNoticePayload | null
  };
}
