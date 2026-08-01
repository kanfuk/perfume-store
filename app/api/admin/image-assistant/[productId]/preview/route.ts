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
      return NextResponse.json({ error: "El cuerpo de vista previa no es válido." }, { status: 400 });
    }
    const { productId } = await context.params;
    const image = await createImageAssistantService().preview(
      productId,
      decodeImageAssistantCsv(body),
      body.candidate as SafeImageCandidate
    );
    return new NextResponse(new Uint8Array(image.buffer), {
      headers: {
        "Content-Type": "image/webp",
        "Content-Length": String(image.size),
        "Cache-Control": "private, no-store"
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No fue posible generar la vista previa." }, { status: 400 });
  }
}
