import { authorizeAdminUsersRequest, adminUserErrorResponse, adminUsersJson } from "@/lib/admin-users-request";
import { createAdminUserService } from "@/services/adminUserService";
import { logAdminAction, requestAuditId } from "@/lib/admin-audit";

type RouteContext = { params: Promise<{ userId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const authorization = await authorizeAdminUsersRequest(request, true);
  if (authorization.response || !authorization.admin) return authorization.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return adminUsersJson({ error: "El cuerpo JSON no es válido." }, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return adminUsersJson({ error: "La acción no es válida." }, 400);
  }

  const input = body as Record<string, unknown>;
  const { userId } = await context.params;
  const service = createAdminUserService();

  try {
    if (input.action === "resend" && Object.keys(input).length === 1) {
      await service.resend(userId, new URL(request.url).origin);
    } else if (
      input.action === "set-active" &&
      typeof input.active === "boolean" &&
      Object.keys(input).every((key) => key === "action" || key === "active")
    ) {
      await service.setActive(userId, input.active, authorization.admin.profileId);
      if (!input.active) await logAdminAction({ actor: authorization.admin, action: "ADMIN_DISABLED", entityType: "admin_user", entityId: userId, requestId: requestAuditId(request), after: { active: false } });
    } else if (input.action === "set-role") {
      return adminUsersJson({
        error: "Smellme utiliza un único OWNER. Los usuarios operativos deben ser ADMIN."
      }, 409);
    } else {
      return adminUsersJson({ error: "La acción no es válida." }, 400);
    }
    return adminUsersJson({ ok: true });
  } catch (error) {
    return adminUserErrorResponse(error);
  }
}
