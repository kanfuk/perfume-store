import { authorizeMaintenanceRequest, maintenanceJson, sanitizedMaintenanceError } from "@/lib/admin-maintenance-request";
import { CATALOG_RESET_CONFIRMATION, hasOnlyFields, isValidIdempotencyKey } from "@/lib/mvp-maintenance";
import { createMvpMaintenanceService } from "@/services/mvpMaintenanceService";

export async function POST(request: Request) {
  const auth = await authorizeMaintenanceRequest(request, { mutation: true });
  if (auth.response) return auth.response;
  try {
    const body: unknown = await request.json();
    if (!hasOnlyFields(body, ["confirmation", "backupConfirmed", "idempotencyKey", "expectedFingerprint"]) ||
        body.confirmation !== CATALOG_RESET_CONFIRMATION || body.backupConfirmed !== true ||
        !isValidIdempotencyKey(body.idempotencyKey) || typeof body.expectedFingerprint !== "string" ||
        !/^[a-f0-9]{32}$/.test(body.expectedFingerprint)) {
      return maintenanceJson({ error: "Confirmación, respaldo o vista previa inválida." }, { status: 400 });
    }
    return maintenanceJson(await createMvpMaintenanceService().catalogReset(body.idempotencyKey as string, body.expectedFingerprint));
  } catch (error) {
    return maintenanceJson({ error: sanitizedMaintenanceError(error) }, { status: 400 });
  }
}
