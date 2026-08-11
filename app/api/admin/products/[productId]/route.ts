import { NextResponse } from "next/server";
import { getAuthenticatedAdmin } from "@/lib/admin-auth";
import { logAdminAction, requestAuditId } from "@/lib/admin-audit";
import { validateJsonRequest, validateTrustedOrigin } from "@/lib/http-security";
import { normalizeStockValue } from "@/lib/stock";
import { ProductRemovalBlockedError, createProductRemovalService } from "@/services/productRemovalService";
import { createProductoService } from "@/services/productoService";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ productId: string }> }
) {
  const admin = await getAuthenticatedAdmin();
  if (!admin) {
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
    const body = (await request.json()) as {
      mode?: "update" | "toggle" | "rename";
      sku?: string;
      nombre?: string;
      nuevoNombre?: string;
      marca?: string;
      contenido?: string;
      descripcion?: string;
      precioVenta?: number;
      precioAnterior?: number;
      imageUrl?: string;
      imageStoragePath?: string;
      badgeLabel?: string;
      costoUnitario?: number;
      stockActual?: number;
      stockAgenda?: number;
      stock?: number;
      stockMinimo?: number;
      activo?: boolean;
      esTop?: boolean;
      esOfertaSemana?: boolean;
      ordenDestacado?: number;
      tipoProducto?: string;
    };
    const { productId } = await context.params;
    const productoService = createProductoService();
    const before = await productoService.obtenerProductoAdminPorId(productId);

    if (body.mode === "rename") {
      const oldName = before?.nombre ?? "";
      const after = await productoService.renombrarProductoAdmin(productId, body.nuevoNombre ?? "");

      await logAdminAction({
        actor: admin,
        action: "PRODUCT_NAME_UPDATED",
        entityType: "product",
        entityId: productId,
        requestId: requestAuditId(request),
        before,
        after,
        metadata: { productId, oldName, newName: after.nombre }
      });

      return NextResponse.json({ ok: true });
    }

    if (body.mode === "toggle") {
      await productoService.cambiarEstadoProducto(productId, Boolean(body.activo));
    } else {
      const normalizedStock = normalizeStockValue(
        body.stock ?? body.stockActual ?? body.stockAgenda ?? 0
      );
      await productoService.actualizarProductoAdmin(productId, {
        sku: body.sku,
        nombre: body.nombre ?? "",
        marca: body.marca,
        contenido: body.contenido,
        descripcion: body.descripcion ?? "",
        precioVenta: body.precioVenta ?? 0,
        precioAnterior: body.precioAnterior,
        imageUrl: body.imageUrl ?? "",
        imageStoragePath: body.imageStoragePath,
        badgeLabel: body.badgeLabel ?? "",
        costoUnitario: body.costoUnitario ?? 0,
        stockActual: normalizedStock,
        stockAgenda: normalizedStock,
        stockMinimo: body.stockMinimo,
        activo: body.activo ?? true,
        esTop: body.esTop,
        esOfertaSemana: body.esOfertaSemana,
        ordenDestacado: body.ordenDestacado,
        tipoProducto: body.tipoProducto ?? "simple"
      });
    }

    const after = await productoService.obtenerProductoAdminPorId(productId);
    const reactivated = Boolean(before?.archivedAt) && !after?.archivedAt;
    const changedPrice = before?.precioVenta !== after?.precioVenta;
    const changedCost = before?.costoUnitario !== after?.costoUnitario;
    const changedStock = before?.stockActual !== after?.stockActual;
    await logAdminAction({
      actor: admin,
      action: reactivated
        ? "PRODUCT_REACTIVATED"
        : changedPrice
          ? "PRICE_CHANGED"
          : changedCost
            ? "COST_CHANGED"
            : changedStock
              ? "STOCK_CHANGED"
              : "PRODUCT_UPDATED",
      entityType: "product",
      entityId: productId,
      requestId: requestAuditId(request),
      before,
      after
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible actualizar el producto."
      },
      { status: 400 }
    );
  }
}

/**
 * Retira un producto del catalogo (V2.2.1, eliminacion segura). Nunca
 * confia en una elegibilidad calculada previamente por el cliente: vuelve a
 * evaluar de cero (ProductRemovalService.retirarProductoAdmin) y, si no
 * esta bloqueado, ejecuta la RPC correspondiente, que revalida otra vez
 * dentro de la transaccion. Ver docs/SMELLME_SAFE_PRODUCT_REMOVAL_DESIGN.md.
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ productId: string }> }
) {
  const admin = await getAuthenticatedAdmin();
  if (!admin) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const trustedOriginError = validateTrustedOrigin(request);

  if (trustedOriginError) {
    return trustedOriginError;
  }

  const { productId } = await context.params;

  try {
    const productoService = createProductoService();
    const removalService = createProductRemovalService();
    const before = await productoService.obtenerProductoAdminPorId(productId);

    const result = await removalService.retirarProductoAdmin(productId);

    if (result.mode === "HARD_DELETE" && result.imageStoragePath) {
      const { getProductImageRepository } = await import("@/repositories/productImageRepository");
      await getProductImageRepository()
        .eliminar(result.imageStoragePath)
        .catch(() => {});
    }

    await logAdminAction({
      actor: admin,
      action: result.mode === "HARD_DELETE" ? "PRODUCT_DELETED" : "PRODUCT_ARCHIVED",
      entityType: "product",
      entityId: productId,
      requestId: requestAuditId(request),
      before,
      after: result.mode === "HARD_DELETE" ? { deleted: true } : { archived: true }
    });

    return NextResponse.json({ ok: true, mode: result.mode });
  } catch (error) {
    if (error instanceof ProductRemovalBlockedError) {
      const message =
        error.reason === "PRODUCT_HAS_OPEN_WEEK_SALES"
          ? "No se puede eliminar hasta realizar el cierre de ventas semanal."
          : "El perfume forma parte de pedidos activos y todavia no puede eliminarse.";

      return NextResponse.json({ error: message, code: error.reason }, { status: 409 });
    }

    const message =
      error instanceof Error ? error.message : "No fue posible eliminar el perfume. Intenta nuevamente.";

    return NextResponse.json({ error: message }, { status: message === "Producto no encontrado." ? 404 : 400 });
  }
}
