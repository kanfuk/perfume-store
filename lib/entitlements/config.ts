import "server-only";

/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Configuracion server-only de la entitlement API (Fase 7A)
 * Descripcion: Unica fuente de las variables de entorno de Riedmann Apps
 * Control. Sigue el mismo patron que lib/supabase/config.ts (normalize +
 * getter que retorna undefined/null en vez de lanzar; el llamador decide la
 * politica de fallo). Nunca acepta la URL de Control desde query/body/
 * header/cookie -- protege contra SSRF (seccion 30 del encargo): el unico
 * origen posible es process.env, leido en el servidor.
 * Seguridad: no incluir claves ni datos sensibles en este archivo.
 */

const DEFAULT_TIMEOUT_MS = 3000;
/** Usado cuando no hay recheckAfterSeconds real disponible (token invalido, primer fail-open sin historial). */
const DEFAULT_RECHECK_SECONDS = 60;
/** Backoff corto tras un error transitorio, para no reintentar Control en cada request (seccion 17: evitar retry storms). */
const DEPENDENCY_ERROR_BACKOFF_SECONDS = 30;

export type EntitlementConfig = {
  controlUrl: string;
  installationToken: string;
  timeoutMs: number;
};

function normalize(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Config real de Riedmann Apps Control. Retorna null si falta alguna
 * variable o la URL no es HTTPS valida -- nunca lanza. El llamador
 * (lib/entitlements/policy.ts) decide que hacer ante ausencia de config
 * (ver seccion "config faltante" en docs/RIEDMANN_APPS_ENTITLEMENT_INTEGRATION.md).
 */
export function getEntitlementConfig(): EntitlementConfig | null {
  const controlUrl = normalize(process.env.RIEDMANN_APPS_CONTROL_URL);
  const installationToken = normalize(process.env.RIEDMANN_APPS_INSTALLATION_TOKEN);

  if (!controlUrl || !installationToken) return null;
  if (!isHttpsUrl(controlUrl)) return null;

  return { controlUrl, installationToken, timeoutMs: DEFAULT_TIMEOUT_MS };
}

export function getDefaultRecheckSeconds(): number {
  return DEFAULT_RECHECK_SECONDS;
}

export function getDependencyErrorBackoffSeconds(): number {
  return DEPENDENCY_ERROR_BACKOFF_SECONDS;
}

/**
 * Mismo criterio que usa Next.js/Vercel: `NODE_ENV=production` en
 * cualquier build de produccion (`next build`), incluidos los deploys de
 * Preview de Vercel -- no solo el dominio productivo final. Se usa como la
 * unica senal para decidir si "falta configuracion" debe ser fail-closed
 * (produccion, seccion "PATCH" de seguridad) o fail-open (desarrollo/test
 * local, para no bloquear el trabajo diario). No depende de VERCEL_ENV a
 * proposito: mas conservador (trata Preview igual que Production).
 */
export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production";
}
