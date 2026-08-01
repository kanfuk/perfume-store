import { authorizeMaintenanceRequest, maintenanceJson, sanitizedMaintenanceError } from "@/lib/admin-maintenance-request";
import { createMvpMaintenanceService } from "@/services/mvpMaintenanceService";

export async function GET(request: Request) {
  const auth = await authorizeMaintenanceRequest(request);
  if (auth.response) return auth.response;
  try {
    return maintenanceJson(await createMvpMaintenanceService().catalogResetPreview());
  } catch (error) {
    return maintenanceJson({ error: sanitizedMaintenanceError(error) }, { status: 400 });
  }
}
