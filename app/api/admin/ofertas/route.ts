import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { validateJsonRequest, validateTrustedOrigin } from "@/lib/http-security";
import { createProductoService } from "@/services/productoService";

/**
 * Fase 7.4A: GET solo confirma la sesion admin (mismo gate 401 que el resto
 * de /api/admin/*). El panel lee el estado de las ofertas desde
 * /api/admin/products (ya expone esOfertaSemana/precioAnterior); no se
 * duplica esa lectura aqui a proposito.
 */
export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}

/**
 * Activa/desactiva "Ofertas de la semana" (es_oferta_semana) en un producto,
 * uno a la vez -- mismo patron no-batch que /api/admin/top12. El maximo
 * (OFFERS_LIMIT) y la validacion de precioAnterior se resuelven siempre en
 * el servidor (services/productoService.ts activarOfertaSemana).
 */
export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const trustedOriginError = validateTrustedOrigin(request);
  if (trustedOriginError) return trustedOriginError;

  const jsonRequestError = validateJsonRequest(request);
  if (jsonRequestError) return jsonRequestError;

  try {
    const body = (await request.json()) as {
      action?: "activar" | "desactivar";
      productId?: string;
      precioAnterior?: unknown;
    };

    const productoService = createProductoService();

    if (body.action === "desactivar") {
      const result = await productoService.desactivarOfertaSemana(body.productId);
      return NextResponse.json({ ok: true, ...result });
    }

    if (typeof body.productId !== "string" || !body.productId) {
      return NextResponse.json({ error: "Selecciona un producto para agregar a las ofertas." }, { status: 400 });
    }

    const result = await productoService.activarOfertaSemana(body.productId, body.precioAnterior);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No fue posible actualizar las ofertas." },
      { status: 400 }
    );
  }
}
