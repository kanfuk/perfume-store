import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { validateJsonRequest, validateTrustedOrigin } from "@/lib/http-security";
import { decodeImageAssistantCsv, hasOnlyFields } from "@/lib/image-assistant/request";
import { computeCsvFingerprint, createImageAssistantService } from "@/services/imageAssistantService";

const FIELDS = new Set(["fileName", "fileBase64"]);

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const originError = validateTrustedOrigin(request);
  if (originError) return originError;
  const jsonError = validateJsonRequest(request);
  if (jsonError) return jsonError;
  try {
    const body = await request.json() as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body) || !hasOnlyFields(body, FIELDS)) {
      return NextResponse.json({ error: "El cuerpo del dry-run no es válido." }, { status: 400 });
    }
    const buffer = decodeImageAssistantCsv(body);
    const result = await createImageAssistantService().dryRun(buffer);
    return NextResponse.json({ ...result, csvFingerprint: computeCsvFingerprint(buffer) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No fue posible ejecutar el dry-run." }, { status: 400 });
  }
}
