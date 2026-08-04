import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import {
  validateJsonRequest,
  validateMultipartRequest,
  validateTrustedOrigin
} from "@/lib/http-security";
import { PRODUCT_IMAGE_CONFIG, isAcceptedProductImageMimeType } from "@/lib/product-image-config";
import { createProductoService } from "@/services/productoService";
import { ProductImageServiceError, createProductImageService } from "@/services/productImageService";

/**
 * Runtime Node.js explicito (no Edge): esta ruta usa Buffer, crypto,
 * validacion binaria y sube/descarga archivos reales desde Supabase Storage
 * a traves de Sharp -- ninguno de esos disponibles/soportados en Edge.
 * `force-dynamic` porque depende de la cookie de sesion admin y del cuerpo
 * multipart de cada peticion, nunca debe servirse cacheada.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Asignacion manual de image_url (URL avanzada, Fase 3B.1A en adelante).
 * Toca UNICAMENTE image_url; valida https:// o ruta local /images/. No
 * sube archivos ni toca Storage. Se mantiene para el consumidor existente
 * ("Opciones avanzadas" en Catalogo -> Productos).
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
    return NextResponse.json(
      { ok: true, ...result },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "No fue posible actualizar la imagen."
      },
      { status: 400 }
    );
  }
}

/**
 * Fase 3B.3: sube y procesa una foto de producto (multipart/form-data,
 * campo "file"). El servidor decide todo -- bucket, storage path, nombre
 * final, formato y dimensiones; nunca acepta esos valores del cliente. Ver
 * services/productImageService.ts para el orden exacto de reemplazo
 * seguro.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ productId: string }> }
) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const trustedOriginError = validateTrustedOrigin(request);
  if (trustedOriginError) return trustedOriginError;

  const multipartError = validateMultipartRequest(request);
  if (multipartError) return multipartError;

  const correlationId = crypto.randomUUID();

  try {
    const { productId } = await context.params;

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: "El cuerpo multipart no es válido." }, { status: 400 });
    }

    const knownFields = new Set(["file"]);
    const unknownFields = Array.from(formData.keys()).filter((key) => !knownFields.has(key));
    if (unknownFields.length > 0) {
      return NextResponse.json(
        { error: `Campos no permitidos: ${unknownFields.join(", ")}.` },
        { status: 400 }
      );
    }

    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Selecciona una imagen JPG, PNG, WebP o AVIF." }, { status: 400 });
    }

    if (file.size === 0) {
      return NextResponse.json({ error: "No fue posible leer la imagen." }, { status: 400 });
    }

    if (file.size > PRODUCT_IMAGE_CONFIG.maxInputBytes) {
      return NextResponse.json(
        { error: "El archivo supera el tamaño permitido." },
        { status: 413 }
      );
    }

    if (file.type && !isAcceptedProductImageMimeType(file.type)) {
      return NextResponse.json({ error: "Selecciona una imagen JPG, PNG, WebP o AVIF." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const productImageService = createProductImageService();
    const image = await productImageService.reemplazarImagenProducto(productId, buffer, correlationId);

    // El producto que se devuelve es el mismo mapeo que usa la lista del
    // catalogo admin (obtenerCatalogoAdmin), releido de forma independiente
    // DESPUES de la verificacion post-escritura del servicio -- el cliente
    // reemplaza su registro local con este objeto completo, sin reconstruir
    // campos a mano.
    const productoService = createProductoService();
    const product = await productoService.obtenerProductoAdminPorId(productId);

    return NextResponse.json(
      {
        ok: true,
        persisted: image.persisted,
        product,
        imageStoragePath: image.storagePath,
        imageUrl: image.displayUrl,
        correlationId: image.correlationId,
        // Se mantiene `image` por compatibilidad con el resto de campos
        // (width, height, format, size) que no forman parte de AdminProductRecord.
        image
      },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const message =
      error instanceof ProductImageServiceError
        ? error.message
        : "No fue posible guardar la imagen. La imagen anterior se mantuvo.";
    const status = message === "No se encontró el producto." ? 404 : 400;
    const code = error instanceof ProductImageServiceError ? error.code : undefined;
    const responseCorrelationId =
      error instanceof ProductImageServiceError && error.correlationId ? error.correlationId : correlationId;

    return NextResponse.json(
      { error: message, code, correlationId: responseCorrelationId },
      { status }
    );
  }
}

/**
 * Fase 3B.3: elimina la imagen asociada al producto (Storage + columnas).
 * Idempotente: llamarlo dos veces no falla la segunda vez. No modifica
 * es_top, orden_destacado ni ningun otro campo del producto.
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ productId: string }> }
) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const trustedOriginError = validateTrustedOrigin(request);
  if (trustedOriginError) return trustedOriginError;

  try {
    const { productId } = await context.params;
    const productImageService = createProductImageService();
    await productImageService.eliminarImagenProducto(productId);

    const productoService = createProductoService();
    const product = await productoService.obtenerProductoAdminPorId(productId);

    return NextResponse.json(
      { ok: true, persisted: true, product, imageStoragePath: "", imageUrl: "" },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const message =
      error instanceof ProductImageServiceError
        ? error.message
        : "No fue posible eliminar la imagen.";
    const status = message === "No se encontró el producto." ? 404 : 400;

    return NextResponse.json({ error: message }, { status });
  }
}
