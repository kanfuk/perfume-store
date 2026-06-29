import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { validateJsonRequest, validateTrustedOrigin } from "@/lib/http-security";
import { normalizeStockValue } from "@/lib/stock";
import { createProductoService } from "@/services/productoService";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  try {
    const productoService = createProductoService();
    const products = await productoService.obtenerCatalogoAdmin();
    return NextResponse.json({ products }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible cargar el catálogo."
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
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
      nombre: string;
      descripcion?: string;
      precioVenta: number;
      imageUrl?: string;
      badgeLabel?: string;
      costoUnitario?: number;
      stockActual?: number;
      stockAgenda?: number;
      stock?: number;
      activo?: boolean;
      tipoProducto?: string;
    };
    const normalizedStock = normalizeStockValue(body.stock ?? body.stockActual ?? body.stockAgenda ?? 0);
    const productoService = createProductoService();
    await productoService.crearProductoAdmin({
      ...body,
      stockActual: normalizedStock,
      stockAgenda: normalizedStock
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible crear el producto."
      },
      { status: 400 }
    );
  }
}
