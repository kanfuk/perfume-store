import { NextResponse } from "next/server";
import { createProductoService } from "@/services/productoService";

export async function GET() {
  try {
    const productoService = createProductoService();
    const products = await productoService.obtenerProductosActivos();

    return NextResponse.json({ products });
  } catch (error) {
    console.error("GET /api/products failed", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible cargar los productos."
      },
      { status: 500 }
    );
  }
}
