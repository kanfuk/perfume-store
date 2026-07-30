import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { validateJsonRequest, validateTrustedOrigin } from "@/lib/http-security";
import { createProductoService, type BulkStockOperation } from "@/services/productoService";

type BulkStockRequestBody = {
  action?: "preview" | "confirm";
  productIds?: string[];
  operation?: BulkStockOperation;
  previewHash?: string;
};

function computePreviewHash(productIds: string[], operation: BulkStockOperation): string {
  const sortedIds = [...productIds].sort();
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({ sortedIds, operation }))
    .digest("hex");
}

/**
 * Stock rapido - edicion masiva: preview (dry-run) y confirm. Activar/pausar
 * toca UNICAMENTE activo; el resto toca UNICAMENTE stock_actual/stock_agenda.
 * La confirmacion exige el hash del preview (productos + operacion).
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
    const body = (await request.json()) as BulkStockRequestBody;
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
    const preview = await productoService.previsualizarAjusteMasivoStock(productIds, operation);
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

    const result = await productoService.confirmarAjusteMasivoStock(productIds, operation);
    return NextResponse.json({ ok: true, ...result, preview });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "No fue posible procesar el ajuste masivo de stock."
      },
      { status: 400 }
    );
  }
}
