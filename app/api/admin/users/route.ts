import { authorizeAdminUsersRequest, adminUserErrorResponse, adminUsersJson } from "@/lib/admin-users-request";
import { validateInviteAdminUserInput } from "@/lib/admin-users";
import { createAdminUserService } from "@/services/adminUserService";
import { logAdminAction, requestAuditId } from "@/lib/admin-audit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authorization = await authorizeAdminUsersRequest(request);
  if (authorization.response) return authorization.response;

  try {
    const users = await createAdminUserService().list(authorization.admin!.profileId);
    return adminUsersJson({ users });
  } catch (error) {
    return adminUserErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeAdminUsersRequest(request, true);
  if (authorization.response) return authorization.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return adminUsersJson({ error: "El cuerpo JSON no es válido." }, 400);
  }
  const validation = validateInviteAdminUserInput(body);
  if (!validation.valid) return adminUsersJson({ error: validation.message }, 400);

  try {
    await createAdminUserService().invite(validation.data, new URL(request.url).origin);
    await logAdminAction({ actor: authorization.admin!, action: "ADMIN_INVITED", entityType: "admin_user", entityId: validation.data.email, requestId: requestAuditId(request), after: { email: validation.data.email, role: "ADMIN" } });
    return adminUsersJson({ ok: true }, 201);
  } catch (error) {
    return adminUserErrorResponse(error);
  }
}
