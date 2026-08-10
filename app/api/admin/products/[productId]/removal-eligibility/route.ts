import { NextResponse } from "next/server";
import { getAuthenticatedAdmin } from "@/lib/admin-auth";
import { createProductRemovalService } from "@/services/productRemovalService";

/**
 * Vista previa de solo lectura para el popup de "Eliminar / Retirar" en
 * Admin -> Catalogo. No autoriza nada por si sola: la mutacion (DELETE
 * .../[productId]) vuelve a evaluar la elegibilidad desde cero al confirmar
 * (evitar TOCTOU, ver docs/SMELLME_SAFE_PRODUCT_REMOVAL_DESIGN.md).
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ productId: string }> }
) {
  const admin = await getAuthenticatedAdmin();
  if (!admin) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  try {
    const { productId } = await context.params;
    const eligibility = await createProductRemovalService().evaluarElegibilidad(productId);
    return NextResponse.json(eligibility);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No fue posible calcular la elegibilidad del producto.";
    return NextResponse.json({ error: message }, { status: message === "Producto no encontrado." ? 404 : 400 });
  }
}
