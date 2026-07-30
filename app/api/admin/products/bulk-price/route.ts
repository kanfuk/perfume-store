import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { validateJsonRequest, validateTrustedOrigin } from "@/lib/http-security";
import { createProductoService, type BulkPriceOperation } from "@/services/productoService";

type BulkPriceRequestBody = {
  action?: "preview" | "confirm";
  productIds?: string[];
  operation?: BulkPriceOperation;
  previewHash?: string;
};

function computePreviewHash(productIds: string[], operation: BulkPriceOperation): string {
  const sortedIds = [...productIds].sort();
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({ sortedIds, operation }))
    .digest("hex");
}

/**
 * Edicion masiva de precios: preview (dry-run, nunca escribe) y confirm
 * (aplica solo precio_venta + modo_precio, nunca stock/imagen/Top12/ofertas).
 * La confirmacion exige el hash del preview (productos + operacion); si
 * cualquiera cambia, se rechaza y exige una vista previa nueva.
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
    const body = (await request.json()) as BulkPriceRequestBody;
    const action = body.action === "confirm" ? "confirm" : "preview";
    const productIds = Array.isArray(body.productIds) ? body.productIds.filter((id) => typeof id === "string") : [];
    const operation = body.operation;

    if (productIds.length === 0) {
      return NextResponse.json({ error: "Selecciona al menos un producto." }, { status: 400 });
    }
    if (!operation || typeof operation.type !== "string") {
      return NextResponse.json({ error: "Falta la operación a aplicar." }, { status: 400 });
    }

    const productoService = createProductoService();
    const preview = await productoService.previsualizarAjusteMasivoPrecio(productIds, operation);
    const previewHash = computePreviewHash(productIds, operation);

    if (action === "preview") {
      return NextResponse.json({ previewHash, preview });
    }

    if (body.previewHash !== previewHash) {
      return NextResponse.json(
        {
          error:
            "La selección de productos o la operación cambiaron respecto a la vista previa. Genera una vista previa nueva antes de confirmar."
        },
        { status: 409 }
      );
    }

    if (preview.erroresGlobales.length > 0) {
      return NextResponse.json(
        { error: "No se puede confirmar: hay errores pendientes.", preview },
        { status: 400 }
      );
    }

    if (preview.productos.length === 0) {
      return NextResponse.json({ error: "No hay productos válidos para actualizar.", preview }, { status: 400 });
    }

    const result = await productoService.confirmarAjusteMasivoPrecio(productIds, operation);
    return NextResponse.json({ ok: true, ...result, preview });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "No fue posible procesar el ajuste masivo."
      },
      { status: 400 }
    );
  }
}
