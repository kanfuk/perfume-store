import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { validateJsonRequest, validateTrustedOrigin } from "@/lib/http-security";
import { normalizeStockValue } from "@/lib/stock";
import { createProductoService } from "@/services/productoService";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ productId: string }> }
) {
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
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const trustedOriginError = validateTrustedOrigin(request);

  if (trustedOriginError) {
    return trustedOriginError;
  }

  try {
    const { productId } = await context.params;
    const productoService = createProductoService();
    await productoService.eliminarProductoAdmin(productId);
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
