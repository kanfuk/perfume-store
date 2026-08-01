import { authorizeMaintenanceRequest, NO_STORE_HEADERS, sanitizedMaintenanceError } from "@/lib/admin-maintenance-request";
import { createMvpMaintenanceService } from "@/services/mvpMaintenanceService";

export async function GET(request: Request) {
  const auth = await authorizeMaintenanceRequest(request);
  if (auth.response) return auth.response;
  const format = new URL(request.url).searchParams.get("format") === "csv" ? "csv" : "json";
  try {
    const file = await createMvpMaintenanceService().catalogBackupFile(format);
    return new Response(file.body, { headers: { ...NO_STORE_HEADERS, "Content-Type": file.contentType, "Content-Disposition": `attachment; filename="${file.filename}"`, "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    return Response.json({ error: sanitizedMaintenanceError(error) }, { status: 400, headers: NO_STORE_HEADERS });
  }
}
