import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { validateJsonRequest, validateTrustedOrigin } from "@/lib/http-security";
import { createProductoService } from "@/services/productoService";

/**
 * Edicion rapida de precios - fila individual. Tres modos:
 * - "manual": fija precio_venta a mano (modo_precio -> MANUAL).
 * - "auto": recalcula precio_venta desde el costo actual + recargo (modo_precio -> AUTO).
 * - "cost": actualiza costo_unitario Y recalcula precio_venta desde ese costo + recargo (modo_precio -> AUTO).
 * Nunca toca stock, imagen, Top 15 (Top 12 legado internamente), ofertas ni
 * cualquier otro dato del producto.
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
      mode?: "manual" | "auto" | "cost";
      precioVenta?: unknown;
      recargoPorcentaje?: unknown;
      costoUnitario?: unknown;
    };
    const { productId } = await context.params;
    const productoService = createProductoService();

    if (body.mode === "auto") {
      const result = await productoService.volverPrecioAutomaticoProducto(
        productId,
        body.recargoPorcentaje
      );
      return NextResponse.json({ ok: true, ...result });
    }

    if (body.mode === "cost") {
      const result = await productoService.actualizarCostoProducto(
        productId,
        body.costoUnitario,
        body.recargoPorcentaje
      );
      return NextResponse.json({ ok: true, ...result });
    }

    const result = await productoService.fijarPrecioManualProducto(productId, body.precioVenta);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "No fue posible actualizar el precio."
      },
      { status: 400 }
    );
  }
}
