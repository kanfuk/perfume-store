import { authorizeMaintenanceRequest, maintenanceJson, sanitizedMaintenanceError } from "@/lib/admin-maintenance-request";
import { hasOnlyFields, isValidIdempotencyKey, ORPHAN_CLEANUP_CONFIRMATION } from "@/lib/mvp-maintenance";
import { createMvpMaintenanceService } from "@/services/mvpMaintenanceService";

export async function POST(request: Request) {
  const auth = await authorizeMaintenanceRequest(request, { mutation: true });
  if (auth.response) return auth.response;
  try {
    const body: unknown = await request.json();
    if (!hasOnlyFields(body, ["confirmation", "idempotencyKey"]) ||
        body.confirmation !== ORPHAN_CLEANUP_CONFIRMATION || !isValidIdempotencyKey(body.idempotencyKey)) {
      return maintenanceJson({ error: "Confirmación o clave de idempotencia inválida." }, { status: 400 });
    }
    return maintenanceJson(await createMvpMaintenanceService().cleanupStorageOrphans(body.idempotencyKey as string));
  } catch (error) {
    return maintenanceJson({ error: sanitizedMaintenanceError(error) }, { status: 400 });
  }
}
