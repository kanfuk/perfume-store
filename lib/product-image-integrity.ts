/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Verificacion de integridad binaria de imagenes de producto.
 * Descripcion: Chequeo liviano de cabecera RIFF/WEBP (sin decodificar) usado
 * tanto para validar lo que se acaba de subir a Storage (services/
 * productImageService.ts) como lo que la ruta same-origin sirve al navegador
 * (app/api/product-images/[...path]/route.ts). Un WebP valido siempre tiene
 * "RIFF" en los bytes 0-3 y "WEBP" en los bytes 8-11 (RFC del contenedor
 * RIFF); cualquier otra cosa ahi es un objeto corrupto, nunca un WebP real.
 */

const RIFF_MAGIC = Buffer.from("RIFF", "ascii");
const WEBP_MAGIC = Buffer.from("WEBP", "ascii");

export function hasValidWebpHeader(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  return buffer.subarray(0, 4).equals(RIFF_MAGIC) && buffer.subarray(8, 12).equals(WEBP_MAGIC);
}
