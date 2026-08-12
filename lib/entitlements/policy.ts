import "server-only";

/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Motor de decision de entitlement para el panel admin (Fase 7A)
 * Descripcion: Combina el cliente HTTP (client.ts) con el cache
 * server-side (cache.ts) y aplica la politica fail-open/fail-closed exacta
 * del encargo (secciones 8-15). Nunca lanza: en el peor caso devuelve
 * fail-open (blocked:false). NO recalcula billing -- Control es la unica
 * fuente autoritativa; este modulo solo decide como reaccionar cuando
 * Control no esta disponible.
 *
 * Resumen de la politica (ver docs/RIEDMANN_APPS_ENTITLEMENT_INTEGRATION.md
 * para la version completa con justificacion de cada rama):
 *
 * - 200 + body valido            -> autoritativo, se cachea tal cual.
 * - 401 (token invalido/revocado) -> FAIL CLOSED (bloquea admin), no es
 *                                    transitorio.
 * - config ausente en Production  -> FAIL CLOSED, categoria propia
 *                                    "configuration-error" (NUNCA se
 *                                    etiqueta como SUSPENDED/DENY de
 *                                    Control). Se revisa en CADA llamada,
 *                                    ANTES de leer el cache, para que una
 *                                    decision ALLOW cacheada nunca oculte
 *                                    una configuracion Production ausente.
 * - config ausente en dev/test     -> FAIL OPEN (no bloquear el trabajo
 *   (sin mock explicito)             local/tests sin credenciales reales).
 * - 429/5xx/timeout/red/200       -> dependency error, FAIL OPEN transitorio:
 *   malformado                      reusa la ULTIMA decision autoritativa
 *                                    cacheada tal cual (un DENY real no se
 *                                    convierte en ALLOW por una falla de
 *                                    red); si no hay ninguna decision previa
 *                                    util, permite admin temporalmente. Esto
 *                                    SOLO aplica cuando hay integracion
 *                                    configurada (config real o mock) -- la
 *                                    ausencia de config nunca se trata como
 *                                    esta clase de falla transitoria.
 */

import { checkAdminEntitlement, type EntitlementCheckResult } from "./client";
import {
  getCachedEntitlement,
  isCacheEntryFresh,
  setCachedEntitlement,
  type CachedEntitlementEntry
} from "./cache";
import { getDefaultRecheckSeconds, getDependencyErrorBackoffSeconds, getEntitlementConfig, isProductionRuntime } from "./config";
import { getMockEntitlementResponse } from "./mock";
import type { EntitlementCheckResponse, EntitlementNoticePayload } from "./schema";

export type AdminEntitlementReason =
  | "authoritative-allow"
  | "authoritative-deny"
  | "token-invalid"
  | "configuration-error"
  | "not-configured-fail-open"
  | "dependency-error-fail-open-no-previous"
  | "dependency-error-stale-allow"
  | "dependency-error-stale-deny"
  | "cache-hit-allow"
  | "cache-hit-deny"
  | "cache-hit-token-invalid"
  | "cache-hit-fallback-allow";

export type AdminEntitlementDecision = {
  blocked: boolean;
  notice: EntitlementNoticePayload | null;
  /** Motivo interno para logging/tests -- nunca se muestra tal cual al usuario final. */
  reason: AdminEntitlementReason;
};

function fromAuthoritativeResponse(
  response: EntitlementCheckResponse,
  reasonWhenAllow: AdminEntitlementReason,
  reasonWhenDeny: AdminEntitlementReason
): AdminEntitlementDecision {
  const blocked = response.decision === "DENY";
  return {
    blocked,
    notice: blocked ? null : response.notice,
    reason: blocked ? reasonWhenDeny : reasonWhenAllow
  };
}

function reuseFreshCacheEntry(entry: CachedEntitlementEntry): AdminEntitlementDecision {
  if (entry.source === "token-invalid") {
    return { blocked: true, notice: null, reason: "cache-hit-token-invalid" };
  }
  if (entry.source === "fallback-allow") {
    return { blocked: false, notice: null, reason: "cache-hit-fallback-allow" };
  }
  // source === "authoritative"
  return fromAuthoritativeResponse(entry.response as EntitlementCheckResponse, "cache-hit-allow", "cache-hit-deny");
}

/** Reusa la ultima decision autoritativa conocida (o el DENY por token invalido) tal cual, ante un fallo transitorio. */
function reuseStaleDecision(cached: CachedEntitlementEntry): AdminEntitlementDecision {
  // Se refresca el reloj del cache con un backoff corto (no el TTL real de
  // Control) para no reintentar Control en cada request mientras dura la
  // falla, sin fingir que esta es una respuesta autoritativa nueva.
  setCachedEntitlement({
    response: cached.response,
    source: cached.source,
    recheckAfterSeconds: getDependencyErrorBackoffSeconds()
  });

  if (cached.source === "token-invalid") {
    return { blocked: true, notice: null, reason: "dependency-error-stale-deny" };
  }
  return fromAuthoritativeResponse(
    cached.response as EntitlementCheckResponse,
    "dependency-error-stale-allow",
    "dependency-error-stale-deny"
  );
}

function missingConfigDecision(): AdminEntitlementDecision {
  if (isProductionRuntime()) {
    // FAIL CLOSED: en Production, olvidar de provisionar el installation
    // token NUNCA debe traducirse en "control comercial bypassed". Motivo
    // interno explicito "configuration-error" -- nunca "token-invalid" ni
    // "authoritative-deny", para que la UI (SuspendedAdminScreen) pueda
    // mostrar un mensaje de configuracion, no uno de suspension comercial,
    // y para que ningun log/metric lo confunda con una decision real de
    // Control.
    return { blocked: true, notice: null, reason: "configuration-error" };
  }
  // Desarrollo/test sin config real ni mock explicito: no bloquear el
  // trabajo local (Fase 7A: mientras no exista un token real, el entorno
  // local no debe quedar inutilizable).
  return { blocked: false, notice: null, reason: "not-configured-fail-open" };
}

export async function evaluateAdminEntitlement(): Promise<AdminEntitlementDecision> {
  // 0. Config ANTES que cache/Control (revisado en CADA llamada): una
  // decision ALLOW cacheada nunca debe ocultar una configuracion Production
  // que quedo invalida/ausente (ej. tras un redeploy sin las env vars). Sin
  // esto, un cache fresco de una corrida anterior podria enmascarar durante
  // minutos que Production ya no tiene integracion configurada.
  const hasRealConfig = getEntitlementConfig() !== null;
  const mocked = getMockEntitlementResponse();

  if (!hasRealConfig && !mocked) {
    return missingConfigDecision();
  }

  // 1. Cache fresco: nunca vuelve a golpear Control (seccion 12 del encargo).
  // Solo se llega aqui con config real o modo mock activo.
  const cached = getCachedEntitlement();
  if (cached && isCacheEntryFresh(cached)) {
    return reuseFreshCacheEntry(cached);
  }

  const result: EntitlementCheckResult = mocked ? { kind: "success", response: mocked } : await checkAdminEntitlement();

  if (result.kind === "success") {
    setCachedEntitlement({
      response: result.response,
      source: "authoritative",
      recheckAfterSeconds: result.response.recheckAfterSeconds
    });
    return fromAuthoritativeResponse(result.response, "authoritative-allow", "authoritative-deny");
  }

  if (result.kind === "unauthorized") {
    // FAIL CLOSED: token invalido/revocado no es transitorio (seccion 9).
    setCachedEntitlement({ response: null, source: "token-invalid", recheckAfterSeconds: getDefaultRecheckSeconds() });
    return { blocked: true, notice: null, reason: "token-invalid" };
  }

  if (result.kind === "not-configured") {
    // Defensivo: la config pudo desaparecer entre el chequeo del paso 0 y
    // esta llamada (carrera improbable, ej. env var editada en caliente).
    // Mismo tratamiento que el chequeo temprano -- nunca se cachea.
    return missingConfigDecision();
  }

  // result.kind === "dependency-error" (429/5xx/timeout/red/200 malformado).
  // Solo se llega aqui con integracion configurada (config real o mock):
  // esto SI es una falla transitoria de disponibilidad, nunca se interpreta
  // como SUSPENDED/DENY (seccion 10).
  if (cached) {
    return reuseStaleDecision(cached);
  }

  // Sin ninguna decision previa util: fail-open temporal (seccion 11.2),
  // cacheado brevemente para no reintentar Control en cada request.
  setCachedEntitlement({ response: null, source: "fallback-allow", recheckAfterSeconds: getDependencyErrorBackoffSeconds() });
  return { blocked: false, notice: null, reason: "dependency-error-fail-open-no-previous" };
}
