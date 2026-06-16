import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { createProductoService } from "@/services/productoService";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ productId: string }> }
) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      mode?: "update" | "toggle";
      nombre?: string;
      descripcion?: string;
      precioVenta?: number;
      costoUnitario?: number;
      stockActual?: number;
      stockAgenda?: number;
      activo?: boolean;
      tipoProducto?: string;
    };
    const { productId } = await context.params;
    const productoService = createProductoService();

    if (body.mode === "toggle") {
      await productoService.cambiarEstadoProducto(productId, Boolean(body.activo));
    } else {
      await productoService.actualizarProductoAdmin(productId, {
        nombre: body.nombre ?? "",
        descripcion: body.descripcion ?? "",
        precioVenta: body.precioVenta ?? 0,
        costoUnitario: body.costoUnitario ?? 0,
        stockActual: body.stockActual ?? 0,
        stockAgenda: body.stockAgenda ?? body.stockActual ?? 0,
        activo: body.activo ?? true,
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
