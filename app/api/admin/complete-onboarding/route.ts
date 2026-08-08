import { NextResponse } from "next/server";
import { validateJsonRequest, validateTrustedOrigin } from "@/lib/http-security";
import {
  AdminOnboardingError,
  completeAuthenticatedAdminOnboarding
} from "@/services/adminOnboardingService";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

export async function POST(request: Request) {
  if (!request.headers.get("origin") && !request.headers.get("referer")) {
    return json({ error: "Origen de solicitud requerido." }, 403);
  }
  const originError = validateTrustedOrigin(request);
  if (originError) return originError;
  const jsonError = validateJsonRequest(request);
  if (jsonError) return jsonError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "El cuerpo JSON no es válido." }, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length > 0) {
    return json({ error: "La solicitud no admite campos." }, 400);
  }

  try {
    await completeAuthenticatedAdminOnboarding();
    return json({ ok: true });
  } catch (error) {
    if (error instanceof AdminOnboardingError) {
      if (error.code === "UNAUTHENTICATED") return json({ error: "No autorizado." }, 401);
      if (error.code === "NOT_AUTHORIZED") return json({ error: "Acceso administrativo no autorizado." }, 403);
    }
    return json({ error: "No fue posible completar la configuración de la cuenta." }, 500);
  }
}
