import { authorizeMaintenanceRequest, maintenanceJson, sanitizedMaintenanceError } from "@/lib/admin-maintenance-request";
import { hasOnlyFields } from "@/lib/mvp-maintenance";
import { createAdminMaintenanceService } from "@/services/adminMaintenanceService";

export async function POST(request: Request) {
  const auth = await authorizeMaintenanceRequest(request, { mutation: true });
  if (auth.response) return auth.response;
  if (!auth.admin) return maintenanceJson({ error: "No autorizado." }, { status: 401 });

  try {
    const body: unknown = await request.json();

    if (!hasOnlyFields(body, ["action"]) || body.action !== "close-month") {
      return maintenanceJson({ error: "Acción inválida." }, { status: 400 });
    }

    const service = createAdminMaintenanceService();
    const result = await service.run(body.action, {
      email: auth.admin.email,
      nombre: auth.admin.nombre
    });

    return maintenanceJson(result);
  } catch (error) {
    return maintenanceJson({ error: sanitizedMaintenanceError(error) }, { status: 400 });
  }
}
