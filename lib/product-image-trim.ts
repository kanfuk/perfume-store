/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Normalizacion visual del tamano aparente del producto dentro de
 * su propia foto.
 * Descripcion: Las fotos de producto ya almacenadas conservan su proporcion
 * original (ver lib/product-image-processing.ts: sin recorte, sin
 * deformar), pero cada una trae una cantidad distinta de fondo/margen vacio
 * alrededor de la botella segun como fue fotografiada. Dentro de un marco
 * de tamano fijo (ProductImageFrame, object-fit: contain), eso hace que el
 * mismo producto se vea "grande" en una foto muy cerrada y "chico" en una
 * foto con mucho aire alrededor, aunque la card sea identica.
 *
 * Esta funcion recorta el margen de fondo casi uniforme alrededor del
 * producto (sharp().trim(), algoritmo determinista de deteccion de bordes
 * por similitud de color -- NO es IA ni recorte "inteligente" del sujeto)
 * para que el contenido util ocupe una proporcion mas parecida del marco
 * entre una foto y otra. Nunca deforma (no cambia la relacion de aspecto
 * salvo por el propio recorte) y nunca reescribe el objeto original en
 * Storage: opera sobre una copia en memoria, solo para la respuesta HTTP.
 *
 * Red de seguridad: si el recorte resultante es sospechosamente agresivo
 * (posible foto ya muy cerrada, o fondo no uniforme que confunde al
 * algoritmo), se descarta el resultado y se devuelve la imagen original
 * sin tocar -- nunca se sirve una imagen rota o recortada de mas.
 */

import sharp from "sharp";

/**
 * Piso de seguridad: si el recorte deja un lado por debajo de este
 * porcentaje del original, se considera un resultado degenerado (foto sin
 * contenido distinguible del fondo, o un fallo del algoritmo) y se
 * descarta. Deliberadamente bajo: un producto fotografiado con mucho aire
 * alrededor es exactamente el caso que se quiere normalizar, no algo que
 * rechazar.
 */
const MIN_SAFE_DIMENSION_RATIO = 0.08;

export type TrimProductImageResult = {
  buffer: Buffer;
  /** true si se aplico el recorte; false si se descarto por la red de seguridad o por un fallo de procesamiento. */
  trimmed: boolean;
};

/**
 * Recorta el margen de fondo casi uniforme alrededor del producto. Funcion
 * pura: recibe un buffer WebP ya validado, devuelve un buffer WebP -- nunca
 * toca red ni Supabase Storage.
 */
export async function trimProductImageMargins(input: Buffer): Promise<TrimProductImageResult> {
  try {
    const original = sharp(input, { failOn: "error" });
    const originalMeta = await original.metadata();
    const originalWidth = originalMeta.width ?? 0;
    const originalHeight = originalMeta.height ?? 0;

    if (originalWidth <= 0 || originalHeight <= 0) {
      return { buffer: input, trimmed: false };
    }

    const trimmedBuffer = await sharp(input, { failOn: "error" })
      .trim({ threshold: 12 })
      .webp({ quality: 86 })
      .toBuffer();

    const trimmedMeta = await sharp(trimmedBuffer).metadata();
    const trimmedWidth = trimmedMeta.width ?? 0;
    const trimmedHeight = trimmedMeta.height ?? 0;

    if (trimmedWidth <= 0 || trimmedHeight <= 0) {
      return { buffer: input, trimmed: false };
    }

    // Si el recorte redujo un lado por debajo del umbral seguro, el fondo
    // probablemente no era uniforme (o el producto ya llenaba casi todo el
    // cuadro) y el algoritmo pudo confundirse -- se prefiere no recortar.
    const widthRatio = trimmedWidth / originalWidth;
    const heightRatio = trimmedHeight / originalHeight;
    if (widthRatio < MIN_SAFE_DIMENSION_RATIO || heightRatio < MIN_SAFE_DIMENSION_RATIO) {
      return { buffer: input, trimmed: false };
    }

    // Sin cambios reales (fondo ya ajustado): se devuelve la original tal
    // cual, sin un segundo paso de recompresion innecesario.
    if (trimmedWidth === originalWidth && trimmedHeight === originalHeight) {
      return { buffer: input, trimmed: false };
    }

    return { buffer: trimmedBuffer, trimmed: true };
  } catch {
    // Cualquier fallo de procesamiento: nunca romper la entrega de la
    // imagen, se sirve la original sin normalizar.
    return { buffer: input, trimmed: false };
  }
}
