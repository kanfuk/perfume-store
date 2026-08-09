import { NextResponse } from "next/server";
import { getAuthenticatedAdmin } from "@/lib/admin-auth";
import { logAdminAction, requestAuditId } from "@/lib/admin-audit";
import { validateJsonRequest, validateTrustedOrigin } from "@/lib/http-security";
import { normalizeStockValue } from "@/lib/stock";
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
      mode?: "update" | "toggle";
      sku?: string;
      nombre?: string;
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
    const changedPrice = before?.precioVenta !== after?.precioVenta;
    const changedCost = before?.costoUnitario !== after?.costoUnitario;
    const changedStock = before?.stockActual !== after?.stockActual;
    await logAdminAction({ actor: admin, action: changedPrice ? "PRICE_CHANGED" : changedCost ? "COST_CHANGED" : changedStock ? "STOCK_CHANGED" : "PRODUCT_UPDATED", entityType: "product", entityId: productId, requestId: requestAuditId(request), before, after });

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

  try {
    const { productId } = await context.params;
    const productoService = createProductoService();
    const before = await productoService.obtenerProductoAdminPorId(productId);
    await productoService.eliminarProductoAdmin(productId);
    await logAdminAction({ actor: admin, action: "PRODUCT_UPDATED", entityType: "product", entityId: productId, requestId: requestAuditId(request), before, after: { deleted: true } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No fue posible eliminar el producto.";

    return NextResponse.json(
      { error: message },
      { status: message.includes("pedidos asociados") ? 409 : 400 }
    );
  }
}
