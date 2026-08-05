/**
 * Proyecto: Perfume Store
 * Modulo: API de Cierres Semanales (Fase 7.6A)
 * Descripcion: Listado paginado (GET) y creacion (POST) de cierres
 * semanales. Requiere admin autenticado; nunca expuesto a anon/publico.
 * Seguridad: No incluir claves ni datos sensibles en este archivo.
 */

import { NextResponse } from "next/server";
import { getAuthenticatedAdmin, isAdminAuthenticated } from "@/lib/admin-auth";
import { validateJsonRequest, validateTrustedOrigin } from "@/lib/http-security";
import { WeeklyClosureError, httpStatusForWeeklyClosureError } from "@/lib/weeklyClosureErrors";
import { createCierreSemanalService } from "@/services/cierreSemanalService";

export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const limitParam = url.searchParams.get("limit");
    const offsetParam = url.searchParams.get("offset");

    const service = createCierreSemanalService();
    const result = await service.listarCierres({
      limit: limitParam ? Number(limitParam) : undefined,
      offset: offsetParam ? Number(offsetParam) : undefined
    });

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
        Expires: "0"
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No fue posible cargar los cierres semanales." },
      { status: 500 }
    );
  }
}

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

    const admin = await getAuthenticatedAdmin();
    const service = createCierreSemanalService();
    const closure = await service.crearCierre(body.mondayDateInput, {
      email: admin?.email ?? null,
      nombre: admin?.nombre ?? null
    });

    return NextResponse.json({ closure }, { status: 201 });
  } catch (error) {
    if (error instanceof WeeklyClosureError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: httpStatusForWeeklyClosureError(error) });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No fue posible cerrar la semana." },
      { status: 400 }
    );
  }
}
