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
      // Las posiciones 1-12 tienen fotografia curada fija (data/top12-image-map.json).
      // Las posiciones 13-15 (Fase 7.2) no tienen foto curada propia todavia: se
      // muestra la imagen real del producto vinculado, nunca una imagen inventada.
      imageUrl: IMAGE_BY_RANK.get(slot.rank) ?? slot.producto?.imageUrl ?? null,
      producto: slot.producto
    }));

    return NextResponse.json({ slots });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No fue posible cargar el Top 15." },
      { status: 400 }
    );
  }
}

/**
 * Vincula/desvincula un producto a una posicion del Top 15 (posiciones 1-12
 * heredan el nombre interno "top12" de la Fase 3B; el contrato no depende
 * del numero 12, ver lib/constants.ts TOP_PRODUCTS_LIMIT). La imagen de una
 * posicion con fotografia curada (1-12) se resuelve SIEMPRE en el servidor
 * desde data/top12-image-map.json -- nunca se confia en una imageUrl enviada
 * por el cliente. Las posiciones sin fotografia curada (13-15) conservan la
 * imagen real del producto vinculado, sin sobrescribirla.
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
    // Solo las posiciones 1-12 tienen fotografia curada fija; las 13-15 no
    // sobrescriben la imagen del producto (ver vincularProductoTop12).
    const imageUrl = IMAGE_BY_RANK.get(rankNumber) ?? null;
    if (typeof body.productId !== "string" || !body.productId) {
      return NextResponse.json({ error: "Selecciona un producto para vincular." }, { status: 400 });
    }

    const result = await productoService.vincularProductoTop12(body.rank, body.productId, imageUrl);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No fue posible actualizar el Top 15." },
      { status: 400 }
    );
  }
}
