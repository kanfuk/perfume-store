/**
 * Proyecto: Perfume Store
 * Modulo: API de Cierres Semanales (Fase 7.6A)
 * Descripcion: Previsualiza el snapshot de un periodo semanal sin
 * persistir nada -- solo lectura, ninguna escritura en cierres_semanales.
 * Seguridad: No incluir claves ni datos sensibles en este archivo.
 */

import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { validateJsonRequest, validateTrustedOrigin } from "@/lib/http-security";
import { WeeklyClosureError, httpStatusForWeeklyClosureError } from "@/lib/weeklyClosureErrors";
import { createCierreSemanalService } from "@/services/cierreSemanalService";

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const trustedOriginError = validateTrustedOrigin(request);
  if (trustedOriginError) {
    return trustedOriginError;
  }

  const jsonRequestError = validateJsonRequest(request);
  if (jsonRequestError) {
    return jsonRequestError;
  }

  try {
    const body = (await request.json()) as { mondayDateInput?: unknown };

    if (typeof body.mondayDateInput !== "string") {
      return NextResponse.json({ error: "El periodo (lunes) es obligatorio." }, { status: 400 });
    }

    const service = createCierreSemanalService();
    const preview = await service.previsualizarCierre(body.mondayDateInput);

    return NextResponse.json(
      { preview },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          Pragma: "no-cache",
          Expires: "0"
        }
      }
    );
  } catch (error) {
    if (error instanceof WeeklyClosureError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: httpStatusForWeeklyClosureError(error) });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No fue posible previsualizar el cierre." },
      { status: 400 }
    );
  }
}
