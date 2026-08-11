import { NextResponse } from "next/server";
import { PRODUCT_IMAGE_CONFIG } from "@/lib/product-image-config";
import { MANAGED_PRODUCT_IMAGE_CONTENT_TYPE, isValidProductImageStoragePath } from "@/lib/product-image-storage-path";
import { hasValidWebpHeader } from "@/lib/product-image-integrity";
import { isSupabaseConfigured } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Entrega same-origin de imagenes administradas (bucket publico
 * product-images).
 * Descripcion: El navegador NUNCA debe depender directamente de Supabase
 * Storage/Cloudflare para ver una foto de producto -- ver
 * lib/product-image-render.ts para la causa completa. Esta ruta es un proxy
 * de solo lectura: descarga el objeto en el SERVIDOR (con la credencial
 * administrativa ya usada por el resto de este feature, nunca expuesta al
 * cliente) y devuelve sus bytes reales bajo el dominio de Smellme. Nunca
 * redirige al dominio externo -- un 302 volveria a exponer al navegador la
 * misma dependencia que se esta eliminando.
 *
 * Publica a proposito (sin isAdminAuthenticated): el bucket ya es publico de
 * solo lectura (ver supabase/migrations/20260803000000_*.sql) y el catalogo
 * publico tambien necesita mostrar estas fotos.
 */

type RouteContext = { params: Promise<{ path?: string[] }> };

async function resolveValidatedPath(context: RouteContext): Promise<string | null> {
  const { path: segments } = await context.params;
  if (!segments || segments.length === 0) return null;

  const joined = segments.join("/");
  return isValidProductImageStoragePath(joined) ? joined : null;
}

type ManagedImageResult =
  | { ok: true; body: ArrayBuffer }
  /** noStore: el objeto existe pero su cabecera RIFF/WEBP es invalida -- nunca se debe cachear un 404 asi, podria auto-repararse subiendo una imagen nueva. */
  | { ok: false; status: 400 | 404 | 500; noStore?: boolean };

async function loadManagedImage(context: RouteContext): Promise<ManagedImageResult> {
  const path = await resolveValidatedPath(context);
  if (!path) {
    return { ok: false, status: 400 };
  }

  if (!isSupabaseConfigured()) {
    return { ok: false, status: 404 };
  }

  try {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.storage.from(PRODUCT_IMAGE_CONFIG.bucket).download(path);

    if (error || !data) {
      return { ok: false, status: 404 };
    }

    const body = await data.arrayBuffer();
    const bodyBuffer = Buffer.from(body);

    // Nunca servir bytes que no son un WebP real: el objeto almacenado esta
    // corrupto (ver docs de la investigacion de bytes de reemplazo UTF-8).
    // No se intenta reparar aqui -- eso corresponde a resubir la imagen.
    if (!hasValidWebpHeader(bodyBuffer)) {
      return { ok: false, status: 404, noStore: true };
    }

    return { ok: true, body };
  } catch {
    // Nunca exponer el mensaje/stack real (podria filtrar detalles de Supabase).
    return { ok: false, status: 500 };
  }
}

function errorBody(status: 400 | 404 | 500, noStore?: boolean) {
  const message =
    status === 400
      ? "Ruta de imagen inválida."
      : status === 404
        ? "Imagen no encontrada."
        : "No fue posible obtener la imagen.";
  return NextResponse.json(
    { error: message },
    { status, headers: noStore ? { "Cache-Control": "no-store" } : undefined }
  );
}

export async function GET(_request: Request, context: RouteContext) {
  const result = await loadManagedImage(context);
  if (!result.ok) {
    return errorBody(result.status, result.noStore);
  }

  return new NextResponse(result.body, {
    status: 200,
    headers: {
      "Content-Type": MANAGED_PRODUCT_IMAGE_CONTENT_TYPE,
      "Content-Length": String(result.body.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

export async function HEAD(_request: Request, context: RouteContext) {
  const result = await loadManagedImage(context);
  if (!result.ok) {
    return new NextResponse(null, {
      status: result.status,
      headers: result.noStore ? { "Cache-Control": "no-store" } : undefined
    });
  }

  return new NextResponse(null, {
    status: 200,
    headers: {
      "Content-Type": MANAGED_PRODUCT_IMAGE_CONTENT_TYPE,
      "Content-Length": String(result.body.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
