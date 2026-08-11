/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Unica fuente de verdad para decidir COMO renderizar una imagen de
 * producto (preloadImage, ProductImage y next/image deben partir todos del
 * mismo resultado -- nunca verificar una URL y renderizar otra).
 *
 * Historial: un primer intento uso `unoptimized` selectivo sobre la URL
 * PUBLICA de Supabase Storage (bypass del optimizador /_next/image, que
 * devolvia 400 INVALID_IMAGE_OPTIMIZE_REQUEST para ese bucket). Insuficiente
 * en QA manual: `preloadImage()` en el navegador seguia fallando ANTES del
 * render de ProductImage -- el navegador cliente seguia dependiendo de una
 * carga cruzada contra Supabase Storage/Cloudflare, con el mismo resultado
 * final ("se guardó, pero todavía no puede visualizarse").
 *
 * Causa raiz real: el navegador NO debe depender de Supabase Storage ni de
 * Cloudflare en absoluto. La solucion definitiva es servir cada imagen
 * administrada por una URL SAME-ORIGIN de Smellme
 * (`/api/product-images/{path}`, ver app/api/product-images/[...path]/
 * route.ts), que el servidor descarga de Supabase Storage y devuelve como
 * bytes propios. El registro en DB (image_url) NO se toca: sigue
 * almacenando la URL publica original de Supabase; esta funcion es la UNICA
 * que transforma esa URL en la ruta interna para el navegador.
 */

import { getSupabaseUrl } from "@/lib/supabase/config";
import { PRODUCT_IMAGE_CONFIG } from "@/lib/product-image-config";
import { isValidProductImageStoragePath } from "@/lib/product-image-storage-path";

export type ProductImageRenderConfig = {
  /** URL original tal como esta persistida en DB (image_url) -- nunca se modifica ni se pierde. */
  originalSrc: string;
  /** URL que debe usar el navegador (same-origin para imagenes administradas). */
  src: string;
  isManagedStorageImage: boolean;
  unoptimized: boolean;
};

/**
 * Prefijo exacto de una imagen administrada por este bucket, dado el URL
 * base de Supabase configurado. Puro (no lee `process.env` directamente)
 * para poder probarse con cualquier proyecto sin mocks.
 */
export function buildManagedProductImagePrefix(supabaseUrl: string | undefined): string | undefined {
  if (!supabaseUrl) return undefined;
  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${PRODUCT_IMAGE_CONFIG.bucket}/`;
}

/**
 * Extrae y valida el path relativo al bucket (`products/{id}/{uuid}.webp`)
 * de una URL publica de Supabase. Devuelve `null` si la URL no pertenece al
 * proyecto/bucket configurado, o si el path no pasa la validacion estricta
 * de lib/product-image-storage-path.ts (traversal, otro bucket, extension
 * invalida, etc.) -- nunca se confia en la forma de la URL sin revalidar.
 */
export function extractManagedProductImagePath(
  url: string,
  supabaseUrl: string | undefined = getSupabaseUrl()
): string | null {
  const prefix = buildManagedProductImagePrefix(supabaseUrl);
  if (!prefix || !url.startsWith(prefix)) return null;

  const relativePath = url.slice(prefix.length);
  return isValidProductImageStoragePath(relativePath) ? relativePath : null;
}

export function isManagedProductImageUrl(
  url: string,
  supabaseUrl: string | undefined = getSupabaseUrl()
): boolean {
  return extractManagedProductImagePath(url, supabaseUrl) !== null;
}

/**
 * Construye la URL same-origin (`/api/product-images/...`), codificando cada
 * segmento por separado -- nunca el path completo (eso codificaria las `/` y
 * rompería la ruta). `trimMargins` agrega `?fit=trim` (ver
 * lib/product-image-trim.ts): variante opt-in, de solo lectura, que recorta
 * el margen de fondo casi uniforme alrededor del producto para que se vea
 * de un tamano visual mas parecido entre fotos. Nunca se usa por defecto.
 */
export function buildSameOriginProductImageUrl(managedPath: string, trimMargins = false): string {
  const encodedSegments = managedPath.split("/").map((segment) => encodeURIComponent(segment));
  const base = `/api/product-images/${encodedSegments.join("/")}`;
  return trimMargins ? `${base}?fit=trim` : base;
}

export function getProductImageRenderConfig(
  url: string,
  supabaseUrl: string | undefined = getSupabaseUrl(),
  trimMargins = false
): ProductImageRenderConfig {
  const trimmed = url?.trim() ?? "";
  const managedPath = trimmed ? extractManagedProductImagePath(trimmed, supabaseUrl) : null;

  if (managedPath) {
    return {
      originalSrc: trimmed,
      src: buildSameOriginProductImageUrl(managedPath, trimMargins),
      isManagedStorageImage: true,
      unoptimized: true
    };
  }

  return { originalSrc: trimmed, src: trimmed, isManagedStorageImage: false, unoptimized: false };
}
