import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { validateJsonRequest, validateTrustedOrigin } from "@/lib/http-security";
import { createProductoService } from "@/services/productoService";
import top12ImageMap from "@/data/top12-image-map.json";

const IMAGE_BY_RANK = new Map<number, string>(
  (top12ImageMap as Array<{ rank: number; imageUrl: string }>).map((entry) => [entry.rank, entry.imageUrl])
);

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  try {
    const productoService = createProductoService();
    const estado = await productoService.obtenerEstadoTop12();
    const slots = estado.map((slot) => ({
      rank: slot.rank,
      imageUrl: IMAGE_BY_RANK.get(slot.rank) ?? null,
      producto: slot.producto
    }));

    return NextResponse.json({ slots });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No fue posible cargar el Top 12." },
      { status: 400 }
    );
  }
}

/**
 * Vincula/desvincula un producto a una posicion del Top 12. La imagen de
 * cada posicion se resuelve SIEMPRE en el servidor desde
 * data/top12-image-map.json -- nunca se confia en una imageUrl enviada por
 * el cliente para esta operacion.
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
    const body = (await request.json()) as {
      action?: "vincular" | "desvincular";
      rank?: unknown;
      productId?: string;
    };

    const productoService = createProductoService();

    if (body.action === "desvincular") {
      const result = await productoService.desvincularProductoTop12(body.rank);
      return NextResponse.json({ ok: true, ...result });
    }

    const rankNumber = typeof body.rank === "number" ? body.rank : Number(body.rank);
    const imageUrl = IMAGE_BY_RANK.get(rankNumber);
    if (!imageUrl) {
      return NextResponse.json({ error: "No hay una imagen configurada para esa posición." }, { status: 400 });
    }
    if (typeof body.productId !== "string" || !body.productId) {
      return NextResponse.json({ error: "Selecciona un producto para vincular." }, { status: 400 });
    }

    const result = await productoService.vincularProductoTop12(body.rank, body.productId, imageUrl);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No fue posible actualizar el Top 12." },
      { status: 400 }
    );
  }
}
