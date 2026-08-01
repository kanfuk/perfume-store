import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { createProductoService } from "@/services/productoService";

/**
 * Catalogo liviano para el buscador de venta directa (/admin/venta-directa,
 * Fase 3B.2). Solo productos activos, sin costoUnitario/utilidadUnitaria,
 * imagen ni descripcion. La familia/variante se agrupa en el cliente con
 * lib/product-families.ts a partir de esta misma respuesta.
 */
export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  try {
    const productoService = createProductoService();
    const products = await productoService.obtenerCatalogoVentaDirecta();

    return NextResponse.json(
      { products },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          Pragma: "no-cache",
          Expires: "0"
        }
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "No fue posible cargar el catálogo."
      },
      { status: 500 }
    );
  }
}
