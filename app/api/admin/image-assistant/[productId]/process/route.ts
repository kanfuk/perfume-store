import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { validateJsonRequest, validateTrustedOrigin } from "@/lib/http-security";
import { decodeImageAssistantCsv, hasOnlyFields } from "@/lib/image-assistant/request";
import type { SafeImageCandidate } from "@/lib/image-assistant/types";
import { createImageAssistantService } from "@/services/imageAssistantService";

const FIELDS = new Set(["fileName", "fileBase64", "candidate"]);

export async function POST(request: Request, context: { params: Promise<{ productId: string }> }) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const originError = validateTrustedOrigin(request);
  if (originError) return originError;
  const jsonError = validateJsonRequest(request);
  if (jsonError) return jsonError;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body) || !hasOnlyFields(body, FIELDS)) {
      return NextResponse.json({ error: "El cuerpo de procesamiento no es válido." }, { status: 400 });
    }
    if (!body.candidate || typeof body.candidate !== "object" || Array.isArray(body.candidate)) {
      return NextResponse.json({ error: "Falta el candidato firmado." }, { status: 400 });
    }
    const { productId } = await context.params;
    const result = await createImageAssistantService().process(
      productId,
      decodeImageAssistantCsv(body),
      body.candidate as SafeImageCandidate
    );
    return NextResponse.json({ ok: true, result }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No fue posible procesar la imagen." }, { status: 400 });
  }
}
