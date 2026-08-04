/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Validador estricto de rutas dentro del bucket administrado
 * product-images.
 * Descripcion: Unico lugar que decide si una ruta relativa es segura de
 * descargar desde Supabase Storage y servir al navegador -- usado tanto por
 * app/api/product-images/[...path]/route.ts (que valida el path que llega en
 * la URL entrante) como por lib/product-image-render.ts (que extrae el path
 * de una URL publica de Supabase ya persistida en DB, para construir la URL
 * same-origin). Una ruta administrada real SIEMPRE tiene la forma EXACTA
 * `products/{productId}/{uuid}.webp` (tres segmentos -- ver
 * buildProductImageStoragePath en lib/product-image-config.ts), asi que
 * cualquier otra forma (traversal, otro bucket, otra extension, segmentos de
 * mas o de menos) se rechaza.
 */

import { PRODUCT_IMAGE_CONFIG } from "@/lib/product-image-config";

const SAFE_SEGMENT_PATTERN = /^[A-Za-z0-9_-]+$/;
const MAX_SEGMENT_LENGTH = 128;
const MAX_PATH_LENGTH = 400;
const REQUIRED_EXTENSION = ".webp";

/**
 * true solo si `path` (SIN el prefijo `bucket/`, ya relativo al bucket) es
 * exactamente `{storagePathPrefix}/{productId}/{uuid}.webp` con segmentos de
 * charset seguro. Rechaza traversal (`..`), backslashes, rutas absolutas,
 * query strings, extensiones distintas de .webp, y cualquier cantidad de
 * segmentos distinta de 3.
 */
export function isValidProductImageStoragePath(path: string): boolean {
  if (!path || path.length > MAX_PATH_LENGTH) return false;
  if (path.includes("..")) return false;
  if (path.includes("\\")) return false;
  if (path.includes("?") || path.includes("#")) return false;
  if (path.startsWith("/") || path.endsWith("/")) return false;

  const segments = path.split("/");
  if (segments.length !== 3) return false;

  const [prefix, productId, filename] = segments;
  if (prefix !== PRODUCT_IMAGE_CONFIG.storagePathPrefix) return false;
  if (!SAFE_SEGMENT_PATTERN.test(productId) || productId.length > MAX_SEGMENT_LENGTH) return false;

  if (!filename.endsWith(REQUIRED_EXTENSION)) return false;
  const baseName = filename.slice(0, -REQUIRED_EXTENSION.length);
  if (!SAFE_SEGMENT_PATTERN.test(baseName) || baseName.length > MAX_SEGMENT_LENGTH) return false;

  return true;
}

/** Content-Type fijo: isValidProductImageStoragePath solo acepta .webp. */
export const MANAGED_PRODUCT_IMAGE_CONTENT_TYPE = "image/webp";
