import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { createProductoService } from "@/services/productoService";

/**
 * Resumen liviano de "Gestion de catalogo" (Fase 3A): solo conteos, nunca
 * listas de productos, clientes, pedidos ni costos individuales. Pensado
 * para el shell de /admin/catalogo (metricas compactas + tarjetas
 * accionables del resumen), sin necesidad de descargar el catalogo completo
 * como hace GET /api/admin/products.
 */
export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  try {
    const productoService = createProductoService();
    const summary = await productoService.obtenerResumenCatalogo();

    return NextResponse.json(summary, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
        Expires: "0"
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "No fue posible cargar el resumen del catálogo."
      },
      { status: 500 }
    );
  }
}
