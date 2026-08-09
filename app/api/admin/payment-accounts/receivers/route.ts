import { adminUsersJson, authorizeAdminUsersRequest } from "@/lib/admin-users-request";
import { createAdminPaymentAccountService } from "@/services/adminPaymentAccountService";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authorization = await authorizeAdminUsersRequest(request);
  if (authorization.response) return authorization.response;

  try {
    const receivers = await createAdminPaymentAccountService().listEligibleReceivers();
    return adminUsersJson({ receivers });
  } catch {
    return adminUsersJson({ error: "No fue posible cargar las cuentas receptoras." }, 500);
  }
}
