import "server-only";

/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Cache server-side de la decision de entitlement (Fase 7A)
 * Descripcion: Cache process-local, en memoria, EXPLICITA Y SIMPLE (seccion
 * 12 del encargo). NUNCA usa localStorage/sessionStorage/IndexedDB (esos son
 * del browser; esta decision es server-only). NUNCA guarda el installation
 * token dentro de la entrada cacheada.
 *
 * LIMITACION DOCUMENTADA (seccion 13 del encargo): si el runtime de Vercel
 * es process-local/in-memory (Node serverless o edge), este cache:
 * - puede perderse entre cold starts;
 * - NO es distribuido entre instancias concurrentes;
 * - NO garantiza coherencia entre multiples instancias (dos lambdas pueden
 *   tener decisiones cacheadas distintas por unos segundos).
 * No se finge una garantia que no existe. La interfaz (get/set por scope)
 * esta deliberadamente separada de policy.ts para poder reemplazar este
 * Map en memoria por un cache distribuido (Redis/Upstash/KV) mas adelante
 * sin tocar la logica de decision.
 * Seguridad: no incluir claves ni datos sensibles en este archivo.
 */

import type { EntitlementCheckResponse } from "./schema";

export type CachedEntitlementSource = "authoritative" | "token-invalid" | "fallback-allow";

export type CachedEntitlementEntry = {
  /** Solo presente cuando source === "authoritative" (la unica que trae un body real de Control). */
  response: EntitlementCheckResponse | null;
  source: CachedEntitlementSource;
  cachedAtMs: number;
  recheckAfterSeconds: number;
};

const SCOPE_KEY = "ADMIN";
const store = new Map<string, CachedEntitlementEntry>();

export function getCachedEntitlement(): CachedEntitlementEntry | null {
  return store.get(SCOPE_KEY) ?? null;
}

export function isCacheEntryFresh(entry: CachedEntitlementEntry, nowMs: number = Date.now()): boolean {
  return nowMs < entry.cachedAtMs + entry.recheckAfterSeconds * 1000;
}

export function setCachedEntitlement(
  entry: Omit<CachedEntitlementEntry, "cachedAtMs">,
  nowMs: number = Date.now()
): void {
  store.set(SCOPE_KEY, { ...entry, cachedAtMs: nowMs });
}

/** Solo para tests: limpia el cache in-memory entre casos (evita fugas de estado entre tests). */
export function resetEntitlementCacheForTests(): void {
  store.clear();
}
