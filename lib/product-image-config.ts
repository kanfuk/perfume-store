/**
 * Proyecto: Perfume Store
 * Modulo: Configuracion de imagenes de producto (Fase 3B.3)
 * Descripcion: Unico lugar con los limites/estandar de procesamiento de
 * fotos de producto subidas por el admin. La API, el servicio y las
 * pruebas importan estos valores en vez de repetir numeros magicos.
 *
 * Los valores de dimension/calidad replican exactamente
 * scripts/catalog/optimize-top12-images.mjs (WebP calidad 86, maximo
 * 1600px por lado, sin upscale) para que una foto subida por el admin
 * quede visualmente consistente con el estandar ya usado por las
 * imagenes de Top 12.
 */

export const PRODUCT_IMAGE_CONFIG = {
  /** MIME aceptados en la subida. SVG/GIF/HEIC quedan fuera a proposito. */
  acceptedMimeTypes: ["image/jpeg", "image/png", "image/webp"] as const,
  /** 10 MiB de entrada; el resultado final queda muy por debajo. */
  maxInputBytes: 10 * 1024 * 1024,
  /** Igual que optimize-top12-images.mjs: MAX_SIDE. */
  maxOutputDimension: 1600,
  /** Igual que optimize-top12-images.mjs: WEBP_QUALITY. */
  webpQuality: 86,
  /** Bucket publico de solo lectura creado en 20260803000000_*.sql. */
  bucket: "product-images",
  /** products/{productId}/{uuid}.webp */
  storagePathPrefix: "products"
} as const;

export type AcceptedProductImageMimeType =
  (typeof PRODUCT_IMAGE_CONFIG.acceptedMimeTypes)[number];

export function isAcceptedProductImageMimeType(value: string): value is AcceptedProductImageMimeType {
  return (PRODUCT_IMAGE_CONFIG.acceptedMimeTypes as readonly string[]).includes(value);
}

/** Path de Storage que la API/servicio genera para una subida nueva. */
export function buildProductImageStoragePath(productId: string, uuid: string): string {
  return `${PRODUCT_IMAGE_CONFIG.storagePathPrefix}/${productId}/${uuid}.webp`;
}

/**
 * Un imageStoragePath solo se borra de Storage si pertenece al bucket
 * administrado por esta feature. Evita borrar por accidente un valor
 * historico que en realidad apunta a una URL externa pegada a mano.
 */
export function isManagedProductImageStoragePath(value: string | undefined | null): value is string {
  return typeof value === "string" && value.startsWith(`${PRODUCT_IMAGE_CONFIG.storagePathPrefix}/`);
}
