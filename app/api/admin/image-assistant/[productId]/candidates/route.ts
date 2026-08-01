import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { validateJsonRequest, validateTrustedOrigin } from "@/lib/http-security";
import { decodeImageAssistantCsv, hasOnlyFields } from "@/lib/image-assistant/request";
import { createImageAssistantService } from "@/services/imageAssistantService";

const FIELDS = new Set(["fileName", "fileBase64"]);

export async function POST(request: Request, context: { params: Promise<{ productId: string }> }) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const originError = validateTrustedOrigin(request);
  if (originError) return originError;
  const jsonError = validateJsonRequest(request);
  if (jsonError) return jsonError;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body) || !hasOnlyFields(body, FIELDS)) {
      return NextResponse.json({ error: "El cuerpo de búsqueda no es válido." }, { status: 400 });
    }
    const { productId } = await context.params;
    const item = await createImageAssistantService().search(productId, decodeImageAssistantCsv(body));
    return NextResponse.json({ item }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No fue posible buscar una imagen segura." }, { status: 400 });
  }
}
