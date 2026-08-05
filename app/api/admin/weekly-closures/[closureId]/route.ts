/**
 * Proyecto: Perfume Store
 * Modulo: API de Cierres Semanales (Fase 7.6A)
 * Descripcion: Detalle (GET) y reapertura auditada (PATCH) de un cierre
 * semanal puntual. La reapertura exige `reason` (5-500 caracteres) y nunca
 * borra ni sobrescribe la fila -- solo cambia su estado.
 * Seguridad: No incluir claves ni datos sensibles en este archivo.
 */

import { NextResponse } from "next/server";
import { getAuthenticatedAdmin, isAdminAuthenticated } from "@/lib/admin-auth";
import { validateJsonRequest, validateTrustedOrigin } from "@/lib/http-security";
import { WeeklyClosureError, httpStatusForWeeklyClosureError } from "@/lib/weeklyClosureErrors";
import { createCierreSemanalService } from "@/services/cierreSemanalService";

type RouteContext = {
  params: Promise<{ closureId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  try {
    const { closureId } = await context.params;
    const service = createCierreSemanalService();
    const closure = await service.obtenerDetalle(closureId);

    return NextResponse.json(
      { closure },
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
      { error: error instanceof Error ? error.message : "No fue posible cargar el cierre semanal." },
      { status: 400 }
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
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
    const { closureId } = await context.params;
    const body = (await request.json()) as { action?: "reopen"; reason?: unknown };

    if (body.action !== "reopen") {
      return NextResponse.json({ error: "Accion no soportada." }, { status: 400 });
    }

    const admin = await getAuthenticatedAdmin();
    const service = createCierreSemanalService();
    const closure = await service.reabrirCierre(closureId, body.reason, {
      email: admin?.email ?? null,
      nombre: admin?.nombre ?? null
    });

    return NextResponse.json({ closure });
  } catch (error) {
    if (error instanceof WeeklyClosureError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: httpStatusForWeeklyClosureError(error) });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No fue posible reabrir el cierre semanal." },
      { status: 400 }
    );
  }
}
