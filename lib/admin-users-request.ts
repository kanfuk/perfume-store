import { NextResponse } from "next/server";
import { getAuthenticatedAdmin, isOwnerAdmin } from "@/lib/admin-auth";
import { validateJsonRequest, validateTrustedOrigin } from "@/lib/http-security";
import { checkRateLimit, getRequestIp } from "@/lib/rate-limit";
import { AdminUserServiceError } from "@/services/adminUserService";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache"
} as const;

export function adminUsersJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

export async function authorizeAdminUsersRequest(request: Request, mutation = false) {
  const admin = await getAuthenticatedAdmin();
  if (!admin) return { response: adminUsersJson({ error: "No autorizado." }, 401) };
  if (!isOwnerAdmin(admin)) return { response: adminUsersJson({ error: "Acceso solo para OWNER." }, 403) };

  const rate = checkRateLimit({
    key: `admin-users:${admin.userId}:${getRequestIp(request)}:${mutation ? "write" : "read"}`,
    maxRequests: mutation ? 12 : 40,
    windowMs: 60_000
  });
  if (!rate.allowed) {
    return { response: adminUsersJson({ error: "Demasiadas solicitudes. Intenta nuevamente en un minuto." }, 429) };
  }

  if (mutation) {
    if (!request.headers.get("origin") && !request.headers.get("referer")) {
      return { response: adminUsersJson({ error: "Origen de solicitud requerido." }, 403) };
    }
    const originError = validateTrustedOrigin(request);
    if (originError) return { response: originError };
    const jsonError = validateJsonRequest(request);
    if (jsonError) return { response: jsonError };
  }

  return { admin };
}

export function adminUserErrorResponse(error: unknown) {
  if (!(error instanceof AdminUserServiceError)) {
    return adminUsersJson({ error: "No fue posible completar la operación." }, 500);
  }

  const responses: Record<string, { message: string; status: number }> = {
    DUPLICATE: { message: "Ese correo ya está autorizado. Revisa su estado en la lista.", status: 409 },
    USER_EXISTS: { message: "Ese correo ya existe en Auth y no puede invitarse automáticamente.", status: 409 },
    NOT_FOUND: { message: "Usuario administrativo no encontrado.", status: 404 },
    NOT_PENDING: { message: "La invitación ya fue aceptada o no puede reenviarse.", status: 409 },
    SELF_LOCKOUT: { message: "No puedes quitarte tu propio acceso OWNER.", status: 409 },
    SINGLE_OWNER: { message: "Smellme utiliza un único OWNER. Los usuarios operativos deben ser ADMIN.", status: 409 },
    PRIMARY_OWNER_IMMUTABLE: { message: "La cuenta OWNER principal no puede degradarse ni desactivarse.", status: 409 },
    INVITE_FAILED: { message: "Supabase no pudo enviar la invitación. Intenta nuevamente.", status: 502 },
    UPDATE_FAILED: { message: "No fue posible actualizar el usuario.", status: 500 }
  };
  const response = responses[error.code] ?? responses.UPDATE_FAILED;
  return adminUsersJson({ error: response.message }, response.status);
}
