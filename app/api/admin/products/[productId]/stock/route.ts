import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { validateJsonRequest, validateTrustedOrigin } from "@/lib/http-security";
import { createProductoService } from "@/services/productoService";

/**
 * Stock rapido - fila individual. Toca UNICAMENTE stock_actual/stock_agenda
 * (o activo, en el modo "agotar" solo si el negocio lo requiere -- aqui no
 * se toca activo). Nunca precio, imagen ni Top 12.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ productId: string }> }
) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const trustedOriginError = validateTrustedOrigin(request);
  if (trustedOriginError) return trustedOriginError;

  const jsonRequestError = validateJsonRequest(request);
  if (jsonRequestError) return jsonRequestError;

  try {
    const body = (await request.json()) as {
      mode?: "delta" | "set" | "agotar";
      delta?: unknown;
      valor?: unknown;
    };
    const { productId } = await context.params;
    const productoService = createProductoService();

    if (body.mode === "agotar") {
      const result = await productoService.agotarProductoRapido(productId);
      return NextResponse.json({ ok: true, ...result });
    }

    if (body.mode === "set") {
      const result = await productoService.establecerStockRapido(productId, body.valor);
      return NextResponse.json({ ok: true, ...result });
    }

    const result = await productoService.ajustarStockRapido(productId, body.delta);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "No fue posible actualizar el stock."
      },
      { status: 400 }
    );
  }
}
