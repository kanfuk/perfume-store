import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { validateJsonRequest, validateTrustedOrigin } from "@/lib/http-security";
import { createProductoService } from "@/services/productoService";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  try {
    const productoService = createProductoService();
    const estado = await productoService.obtenerEstadoTop12();
    const slots = estado.map((slot) => ({
      rank: slot.rank,
      // Fase 7.4: la imagen pertenece siempre al producto, nunca a la posicion.
      // Ya no existe una fotografia curada fija por rank (ver data/top12-image-map.json
      // para el detalle de por que ese mapa historico quedo sin consumo automatico).
      imageUrl: slot.producto?.imageUrl ?? null,
      producto: slot.producto
    }));

    return NextResponse.json({ slots });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No fue posible cargar el Top 15." },
      { status: 400 }
    );
  }
}

/**
 * Vincula/desvincula un producto a una posicion del Top 15 (posiciones 1-12
 * heredan el nombre interno "top12" de la Fase 3B; el contrato no depende
 * del numero 12, ver lib/constants.ts TOP_PRODUCTS_LIMIT). Fase 7.4: la
 * imagen pertenece siempre al producto, nunca a la posicion -- este endpoint
 * nunca acepta ni escribe una imageUrl, sea del cliente o de un mapa
 * curado por rank.
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
      action?: "vincular" | "desvincular";
      rank?: unknown;
      productId?: string;
    };

    const productoService = createProductoService();

    if (body.action === "desvincular") {
      const result = await productoService.desvincularProductoTop12(body.rank);
      return NextResponse.json({ ok: true, ...result });
    }

    if (typeof body.productId !== "string" || !body.productId) {
      return NextResponse.json({ error: "Selecciona un producto para vincular." }, { status: 400 });
    }

    const result = await productoService.vincularProductoTop12(body.rank, body.productId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No fue posible actualizar el Top 15." },
      { status: 400 }
    );
  }
}
