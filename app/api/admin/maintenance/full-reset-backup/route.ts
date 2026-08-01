import { authorizeMaintenanceRequest, NO_STORE_HEADERS, sanitizedMaintenanceError } from "@/lib/admin-maintenance-request";
import { hasOnlyFields } from "@/lib/mvp-maintenance";
import { createMvpMaintenanceService } from "@/services/mvpMaintenanceService";

export async function POST(request: Request) {
  const auth = await authorizeMaintenanceRequest(request, { mutation: true });
  if (auth.response) return auth.response;
  try {
    const body: unknown = await request.json();
    if (!hasOnlyFields(body, [])) return Response.json({ error: "La solicitud contiene campos no permitidos." }, { status: 400, headers: NO_STORE_HEADERS });
    const file = await createMvpMaintenanceService().fullOperationalBackupFile();
    return new Response(file.body, { headers: { ...NO_STORE_HEADERS, "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${file.filename}"`, "X-Content-Type-Options": "nosniff",
      "X-Smellme-Backup-Id": file.backupId, "X-Smellme-Backup-Fingerprint": file.fingerprint,
      "X-Smellme-Preview-Fingerprint": file.previewFingerprint } });
  } catch (error) {
    return Response.json({ error: sanitizedMaintenanceError(error) }, { status: 400, headers: NO_STORE_HEADERS });
  }
}
