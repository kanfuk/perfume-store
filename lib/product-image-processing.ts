/**
 * Proyecto: Perfume Store
 * Modulo: Procesamiento de imagenes de producto (Fase 3B.3)
 * Descripcion: Transforma el archivo subido por el admin al estandar real
 * ya usado por las imagenes de Top 12 (ver
 * scripts/catalog/optimize-top12-images.mjs): autorotacion EXIF, proporcion
 * preservada (sin recorte, sin deformar, sin upscale), maximo 1600px por
 * lado, WebP calidad 86. Funcion pura: recibe un buffer, devuelve un
 * buffer -- nunca toca red ni Supabase Storage, por lo que se puede probar
 * con fixtures sinteticos.
 * Seguridad: no incluir claves ni datos sensibles en este archivo.
 */

import sharp from "sharp";
import { PRODUCT_IMAGE_CONFIG, isAcceptedProductImageMimeType } from "@/lib/product-image-config";

export class ProductImageProcessingError extends Error {
  readonly code:
    | "UNSUPPORTED_FORMAT"
    | "HEIC_UNSUPPORTED"
    | "DECODE_FAILED"
    | "PROCESSING_FAILED"
    | "EMPTY_BUFFER";

  constructor(code: ProductImageProcessingError["code"], message: string) {
    super(message);
    this.name = "ProductImageProcessingError";
    this.code = code;
  }
}

export type ProcessedProductImage = {
  buffer: Buffer;
  width: number;
  height: number;
  format: "webp";
  size: number;
};

/**
 * HEIC/HEIF se identifica por una caja ISO-BMFF "ftyp" cuyo brand (bytes
 * 8-11 de la caja, offset 4-11 del archivo tras el tamano de 4 bytes) es
 * heic/heix/hevc/heim/heis/hevm/hevs/mif1. Sniff liviano, sin decodificar:
 * solo sirve para devolver el mensaje amigable del runbook en vez de un
 * error generico de decodificacion, sin agregar una dependencia de HEIC.
 */
const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "heim", "heis", "hevm", "hevs", "mif1"]);

function looksLikeHeic(buffer: Buffer): boolean {
  if (buffer.length < 12) {
    return false;
  }

  const boxType = buffer.toString("ascii", 4, 8);
  if (boxType !== "ftyp") {
    return false;
  }

  const brand = buffer.toString("ascii", 8, 12).toLowerCase();
  return HEIC_BRANDS.has(brand);
}

/**
 * Valida y transforma la imagen. Lanza ProductImageProcessingError con un
 * codigo estable; el llamador (servicio/API) traduce el codigo al mensaje
 * en espanol correspondiente del runbook.
 */
export async function processProductImage(input: Buffer): Promise<ProcessedProductImage> {
  if (!input || input.length === 0) {
    throw new ProductImageProcessingError("EMPTY_BUFFER", "El archivo esta vacio.");
  }

  if (looksLikeHeic(input)) {
    throw new ProductImageProcessingError(
      "HEIC_UNSUPPORTED",
      "Este formato no es compatible. Convierte la imagen a JPG, PNG o WebP."
    );
  }

  let metadata: sharp.Metadata;

  try {
    metadata = await sharp(input, { failOn: "error" }).metadata();
  } catch {
    throw new ProductImageProcessingError("DECODE_FAILED", "No fue posible leer la imagen.");
  }

  const format = metadata.format;
  const decodedMime =
    format === "jpeg" ? "image/jpeg" : format === "png" ? "image/png" : format === "webp" ? "image/webp" : "";

  if (!decodedMime || !isAcceptedProductImageMimeType(decodedMime)) {
    throw new ProductImageProcessingError(
      "UNSUPPORTED_FORMAT",
      "Selecciona una imagen JPG, PNG o WebP."
    );
  }

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  if (width <= 0 || height <= 0) {
    throw new ProductImageProcessingError("DECODE_FAILED", "No fue posible leer la imagen.");
  }

  const maxSide = PRODUCT_IMAGE_CONFIG.maxOutputDimension;
  const longestSide = Math.max(width, height);

  let pipeline = sharp(input, { failOn: "error" }).rotate();

  if (longestSide > maxSide) {
    pipeline = pipeline.resize({
      width: width >= height ? maxSide : undefined,
      height: height > width ? maxSide : undefined,
      fit: "inside",
      withoutEnlargement: true
    });
  }

  let buffer: Buffer;

  try {
    buffer = await pipeline.webp({ quality: PRODUCT_IMAGE_CONFIG.webpQuality }).toBuffer();
  } catch {
    throw new ProductImageProcessingError("PROCESSING_FAILED", "No fue posible procesar la imagen.");
  }

  const outMeta = await sharp(buffer).metadata();

  return {
    buffer,
    width: outMeta.width ?? 0,
    height: outMeta.height ?? 0,
    format: "webp",
    size: buffer.length
  };
}
