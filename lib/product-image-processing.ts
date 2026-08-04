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

type SharpMetadata = Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;

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
 * HEIC/HEIF y AVIF comparten el mismo contenedor ISO-BMFF: se distinguen por
 * el brand de la caja "ftyp" (bytes 8-11 de la caja, offset 4-11 del
 * archivo tras el tamano de 4 bytes). Sniff liviano, sin decodificar. Esto
 * importa porque libvips/sharp reporta el `format` de AMBOS como "heif" en
 * `metadata()` -- sin este sniff no hay forma de distinguir un AVIF real
 * (que sharp SI puede decodificar en esta instalacion, verificado) de un
 * HEIC (que no soportamos, sin agregar una dependencia nueva).
 */
const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "heim", "heis", "hevm", "hevs", "mif1"]);
const AVIF_BRANDS = new Set(["avif", "avis"]);

function sniffIsoBmffBrand(buffer: Buffer): string | null {
  if (buffer.length < 12) {
    return null;
  }

  const boxType = buffer.toString("ascii", 4, 8);
  if (boxType !== "ftyp") {
    return null;
  }

  return buffer.toString("ascii", 8, 12).toLowerCase();
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

  const isoBrand = sniffIsoBmffBrand(input);

  if (isoBrand !== null && HEIC_BRANDS.has(isoBrand)) {
    throw new ProductImageProcessingError(
      "HEIC_UNSUPPORTED",
      "Este formato no es compatible. Convierte la imagen a JPG, PNG, WebP o AVIF."
    );
  }

  const isAvifContainer = isoBrand !== null && AVIF_BRANDS.has(isoBrand);

  let metadata: SharpMetadata;

  try {
    metadata = await sharp(input, { failOn: "error" }).metadata();
  } catch {
    throw new ProductImageProcessingError("DECODE_FAILED", "No fue posible leer la imagen.");
  }

  const format = metadata.format;
  const decodedMime =
    format === "jpeg"
      ? "image/jpeg"
      : format === "png"
        ? "image/png"
        : format === "webp"
          ? "image/webp"
          : isAvifContainer && format === "heif"
            ? "image/avif"
            : "";

  if (!decodedMime || !isAcceptedProductImageMimeType(decodedMime)) {
    throw new ProductImageProcessingError(
      "UNSUPPORTED_FORMAT",
      "Selecciona una imagen JPG, PNG, WebP o AVIF."
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
