import "server-only";

/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Cliente HTTP server-only de la entitlement API (Fase 7A)
 * Descripcion: UNICO punto del repo que habla HTTP con Riedmann Apps
 * Control. Nunca se debe importar desde un Client Component -- el paquete
 * `server-only` revienta el build si ocurre. El browser nunca conoce el
 * installation token ni la URL de Control (arquitectura obligatoria,
 * seccion 2 del encargo).
 * Seguridad: no incluir claves ni datos sensibles en este archivo. Nunca
 * loggear el header Authorization ni el token (ver lib/entitlements/logging.ts).
 */

import { appInfo } from "@/lib/app-info";
import { getEntitlementConfig } from "./config";
import { parseEntitlementCheckResponse, type EntitlementCheckResponse } from "./schema";

export type EntitlementDependencyErrorReason = "timeout" | "network" | "http-error" | "malformed-response";

export type EntitlementCheckResult =
  | { kind: "success"; response: EntitlementCheckResponse }
  | { kind: "unauthorized" }
  | { kind: "not-configured" }
  | { kind: "dependency-error"; reason: EntitlementDependencyErrorReason; httpStatus?: number };

/** El contrato es pequeño (seccion 32 del encargo): limite defensivo, sin sobre-ingenieria. */
const MAX_RESPONSE_BYTES = 8192;
const ENTITLEMENT_CHECK_PATH = "/api/v1/entitlements/check";

async function readBoundedText(response: Response): Promise<string | null> {
  const body = await response.text().catch(() => null);
  if (body === null) return null;
  if (body.length > MAX_RESPONSE_BYTES) return null;
  return body;
}

/**
 * Consulta el scope ADMIN de la entitlement API. Nunca lanza: cualquier
 * fallo (config faltante, timeout, red, HTTP no-2xx, body malformado) se
 * devuelve como un resultado tipado para que lib/entitlements/policy.ts
 * aplique la politica fail-open/fail-closed correspondiente. Sin retries
 * (seccion 17: evitar retry storms; 0 reintentos es la opcion mas simple y
 * seguirà sin justificacion clara para agregar uno).
 */
export async function checkAdminEntitlement(): Promise<EntitlementCheckResult> {
  const config = getEntitlementConfig();
  if (!config) return { kind: "not-configured" };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(`${config.controlUrl.replace(/\/+$/, "")}${ENTITLEMENT_CHECK_PATH}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.installationToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ scope: "ADMIN", appVersion: appInfo.version }),
      signal: controller.signal,
      cache: "no-store"
    });

    if (response.status === 401) {
      return { kind: "unauthorized" };
    }

    if (!response.ok) {
      return { kind: "dependency-error", reason: "http-error", httpStatus: response.status };
    }

    const text = await readBoundedText(response);
    if (text === null) {
      return { kind: "dependency-error", reason: "malformed-response", httpStatus: response.status };
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return { kind: "dependency-error", reason: "malformed-response", httpStatus: response.status };
    }

    const parsed = parseEntitlementCheckResponse(json);
    if (!parsed) {
      return { kind: "dependency-error", reason: "malformed-response", httpStatus: response.status };
    }

    return { kind: "success", response: parsed };
  } catch (error) {
    const reason: EntitlementDependencyErrorReason =
      error instanceof Error && error.name === "AbortError" ? "timeout" : "network";
    return { kind: "dependency-error", reason };
  } finally {
    clearTimeout(timeoutId);
  }
}
