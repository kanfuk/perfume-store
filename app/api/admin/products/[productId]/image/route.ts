import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { validateJsonRequest, validateTrustedOrigin } from "@/lib/http-security";
import { createProductoService } from "@/services/productoService";

/**
 * Asignacion manual de image_url. Toca UNICAMENTE image_url; valida
 * https:// o ruta local /images/. No sube archivos ni toca Storage.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ productId: string }> }
) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const trustedOriginError = validateTrustedOrigin(request);
  if (trustedOriginError) return trustedOriginError;

  const jsonRequestError = validateJsonRequest(request);
  if (jsonRequestError) return jsonRequestError;

  try {
    const body = (await request.json()) as { imageUrl?: unknown };
    const { productId } = await context.params;
    const productoService = createProductoService();

    const result = await productoService.asignarImagenProducto(productId, body.imageUrl);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "No fue posible actualizar la imagen."
      },
      { status: 400 }
    );
  }
}
