import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getAuthenticatedAdmin, isAdminAuthenticated } from "@/lib/admin-auth";
import { logAdminAction, requestAuditId } from "@/lib/admin-audit";
import { validateJsonRequest, validateTrustedOrigin } from "@/lib/http-security";
import { createProductoService, BULK_STOCK_OPERATION_TYPES, type BulkStockOperation } from "@/services/productoService";

type BulkStockRequestBody = {
  action?: "preview" | "confirm";
  productIds?: string[];
  operation?: BulkStockOperation;
  previewHash?: string;
};

/** Fase 2B.9: limite razonable por solicitud (evita abuso y cargas descontroladas). */
const MAX_PRODUCT_IDS = 500;

function computePreviewHash(productIds: string[], operation: BulkStockOperation): string {
  const sortedIds = [...productIds].sort();
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({ sortedIds, operation }))
    .digest("hex");
}

function isKnownOperationType(type: unknown): type is BulkStockOperation["type"] {
  return typeof type === "string" && (BULK_STOCK_OPERATION_TYPES as readonly string[]).includes(type);
}

/**
 * Stock rapido - edicion masiva: preview (dry-run) y confirm. Activar/pausar
 * toca UNICAMENTE activo; el resto toca UNICAMENTE stock_actual/stock_agenda.
 * La confirmacion exige el hash del preview (productos + operacion). El
 * servidor revalida TODO: nunca confia en stock/estado final calculado por
 * el navegador, solo en los productIds y la operacion solicitada.
 */
export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const admin = await getAuthenticatedAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const trustedOriginError = validateTrustedOrigin(request);
  if (trustedOriginError) return trustedOriginError;

  const jsonRequestError = validateJsonRequest(request);
  if (jsonRequestError) return jsonRequestError;

  try {
    const body = (await request.json()) as BulkStockRequestBody;
    const action = body.action === "confirm" ? "confirm" : "preview";
    const rawProductIds = Array.isArray(body.productIds)
      ? body.productIds.filter((id): id is string => typeof id === "string" && id.trim() !== "")
      : [];
    // Deduplicar explicitamente en vez de rechazar: una seleccion masiva
    // (ej. "seleccionar todo" + "seleccionar resultados" combinados) puede
    // producir IDs repetidos de forma legitima sin intencion maliciosa.
    const productIds = [...new Set(rawProductIds)];
    const operation = body.operation;

    if (productIds.length === 0) {
      return NextResponse.json({ error: "Selecciona al menos un producto." }, { status: 400 });
    }
    if (productIds.length > MAX_PRODUCT_IDS) {
      return NextResponse.json(
        { error: `No se pueden procesar más de ${MAX_PRODUCT_IDS} productos por solicitud.` },
        { status: 400 }
      );
    }
    if (!operation || !isKnownOperationType(operation.type)) {
      return NextResponse.json({ error: "La acción solicitada no es válida." }, { status: 400 });
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

    if (preview.productos.every((row) => row.status === "BLOQUEADO")) {
      return NextResponse.json({ error: "No hay productos válidos para actualizar.", preview }, { status: 400 });
    }

    const result = await productoService.confirmarAjusteMasivoStock(productIds, operation);
    await logAdminAction({ actor: admin, action: "STOCK_CHANGED", entityType: "product_batch", requestId: requestAuditId(request), after: result, metadata: { productIds, operation } });
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
