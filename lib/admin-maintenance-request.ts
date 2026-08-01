import { NextResponse } from "next/server";
import { getAuthenticatedAdmin } from "@/lib/admin-auth";
import { validateJsonRequest, validateTrustedOrigin } from "@/lib/http-security";
import { checkRateLimit, getRequestIp } from "@/lib/rate-limit";

export const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache"
} as const;

export function maintenanceJson(data: unknown, init?: { status?: number }) {
  return NextResponse.json(data, { status: init?.status, headers: NO_STORE_HEADERS });
}

export async function authorizeMaintenanceRequest(
  request: Request,
  options?: { mutation?: boolean }
): Promise<{ admin?: Awaited<ReturnType<typeof getAuthenticatedAdmin>>; response?: Response }> {
  const admin = await getAuthenticatedAdmin();
  if (!admin) return { response: maintenanceJson({ error: "No autorizado." }, { status: 401 }) };

  const rate = checkRateLimit({
    key: `admin-maintenance:${admin.userId}:${getRequestIp(request)}:${options?.mutation ? "write" : "read"}`,
    maxRequests: options?.mutation ? 8 : 30,
    windowMs: 60_000
  });
  if (!rate.allowed) return { response: maintenanceJson({ error: "Demasiadas solicitudes. Intenta nuevamente en un minuto." }, { status: 429 }) };

  if (options?.mutation) {
    if (!request.headers.get("origin") && !request.headers.get("referer")) {
      return { response: maintenanceJson({ error: "Origen de solicitud requerido." }, { status: 403 }) };
    }
    const originError = validateTrustedOrigin(request);
    if (originError) {
      for (const [name, value] of Object.entries(NO_STORE_HEADERS)) originError.headers.set(name, value);
      return { response: originError };
    }
    const jsonError = validateJsonRequest(request);
    if (jsonError) {
      for (const [name, value] of Object.entries(NO_STORE_HEADERS)) jsonError.headers.set(name, value);
      return { response: jsonError };
    }
  }

  return { admin };
}

export function sanitizedMaintenanceError(error: unknown) {
  const message = error instanceof Error ? error.message : "No fue posible completar la operación.";
  if (/^(QA|RESET|STORAGE|MVP)\d{3}:/.test(message)) return message;
  return "No fue posible completar la operación de mantenimiento.";
}
