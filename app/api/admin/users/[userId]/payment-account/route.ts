import type { AdminPaymentAccountFormInput } from "@/lib/admin-payment-accounts";
import {
  adminUsersJson,
  authorizeAdminUsersRequest
} from "@/lib/admin-users-request";
import {
  AdminPaymentAccountServiceError,
  createAdminPaymentAccountService
} from "@/services/adminPaymentAccountService";
import { logAdminAction, requestAuditId } from "@/lib/admin-audit";

type RouteContext = { params: Promise<{ userId: string }> };

const ACCOUNT_FIELDS = new Set([
  "banco",
  "bancoOtro",
  "tipoCuenta",
  "tipoCuentaOtro",
  "titularCuenta",
  "rutTitular",
  "numeroCuenta",
  "correo",
  "active"
]);

function accountError(error: unknown) {
  if (error instanceof AdminPaymentAccountServiceError) {
    if (error.code === "NOT_FOUND") {
      return adminUsersJson({ error: "Usuario administrativo no encontrado." }, 404);
    }
    if (error.code === "NOT_ADMIN") {
      return adminUsersJson({ error: "El OWNER principal no requiere cuenta de cobro." }, 409);
    }
  }
  return adminUsersJson({ error: "No fue posible guardar la cuenta de cobro." }, 500);
}

export async function GET(request: Request, context: RouteContext) {
  const authorization = await authorizeAdminUsersRequest(request);
  if (authorization.response) return authorization.response;

  try {
    const { userId } = await context.params;
    const account = await createAdminPaymentAccountService().getForOwner(userId);
    return adminUsersJson({ account });
  } catch (error) {
    return accountError(error);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const authorization = await authorizeAdminUsersRequest(request, true);
  if (authorization.response) return authorization.response;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return adminUsersJson({ error: "El cuerpo JSON no es válido." }, 400);
  }
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    return adminUsersJson({ error: "Los datos de cuenta no son válidos." }, 400);
  }
  const body = rawBody as Record<string, unknown>;
  if (Object.keys(body).some((key) => !ACCOUNT_FIELDS.has(key))) {
    return adminUsersJson({ error: "La cuenta contiene campos no permitidos." }, 400);
  }

  const input: AdminPaymentAccountFormInput = {
    banco: typeof body.banco === "string" ? body.banco : "",
    bancoOtro: typeof body.bancoOtro === "string" ? body.bancoOtro : "",
    tipoCuenta: typeof body.tipoCuenta === "string" ? body.tipoCuenta : "",
    tipoCuentaOtro:
      typeof body.tipoCuentaOtro === "string" ? body.tipoCuentaOtro : "",
    titularCuenta: typeof body.titularCuenta === "string" ? body.titularCuenta : "",
    rutTitular: typeof body.rutTitular === "string" ? body.rutTitular : "",
    numeroCuenta: typeof body.numeroCuenta === "string" ? body.numeroCuenta : "",
    correo: typeof body.correo === "string" ? body.correo : "",
    active: body.active !== false
  };

  try {
    const { userId } = await context.params;
    const result = await createAdminPaymentAccountService().saveForOwner(userId, input);
    if (!result.valid) return adminUsersJson({ errors: result.errors }, 400);
    await logAdminAction({ actor: authorization.admin!, action: "PAYMENT_ACCOUNT_UPDATED", entityType: "admin_payment_account", entityId: userId, requestId: requestAuditId(request), after: { active: input.active }, metadata: { ownerManaged: true } });
    return adminUsersJson({ ok: true });
  } catch (error) {
    return accountError(error);
  }
}
