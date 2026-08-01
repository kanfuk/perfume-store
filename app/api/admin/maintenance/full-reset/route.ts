import { revalidatePath, revalidateTag } from "next/cache";
import { authorizeMaintenanceRequest, maintenanceJson, sanitizedMaintenanceError } from "@/lib/admin-maintenance-request";
import { FULL_OPERATIONAL_RESET_CONFIRMATION, hasOnlyFields, isValidIdempotencyKey } from "@/lib/mvp-maintenance";
import { createMvpMaintenanceService } from "@/services/mvpMaintenanceService";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FINGERPRINT = /^[a-f0-9]{32}$/;

export async function POST(request: Request) {
  const auth = await authorizeMaintenanceRequest(request, { mutation: true });
  if (auth.response) return auth.response;
  try {
    const body: unknown = await request.json();
    if (!hasOnlyFields(body, ["confirmation", "understood", "idempotencyKey", "backupId", "backupFingerprint", "expectedFingerprint"]) ||
        body.confirmation !== FULL_OPERATIONAL_RESET_CONFIRMATION || body.understood !== true ||
        !isValidIdempotencyKey(body.idempotencyKey) || typeof body.backupId !== "string" || !UUID.test(body.backupId) ||
        typeof body.backupFingerprint !== "string" || !FINGERPRINT.test(body.backupFingerprint) ||
        typeof body.expectedFingerprint !== "string" || !FINGERPRINT.test(body.expectedFingerprint)) {
      return maintenanceJson({ error: "Confirmación, aceptación, respaldo o preview inválido." }, { status: 400 });
    }
    const result = await createMvpMaintenanceService().fullOperationalReset({
      idempotencyKey: body.idempotencyKey as string, backupId: body.backupId,
      backupFingerprint: body.backupFingerprint, expectedFingerprint: body.expectedFingerprint
    });
    revalidatePath("/", "layout");
    revalidatePath("/admin", "layout");
    revalidateTag("catalog", { expire: 0 });
    revalidateTag("admin-catalog", { expire: 0 });
    return maintenanceJson(result);
  } catch (error) {
    return maintenanceJson({ error: sanitizedMaintenanceError(error) }, { status: 400 });
  }
}
