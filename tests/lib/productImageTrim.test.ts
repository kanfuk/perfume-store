import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { trimProductImageMargins } from "@/lib/product-image-trim";

/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Cobertura de la normalizacion visual del tamano aparente del producto
 * (ver lib/product-image-trim.ts): recorta el margen de fondo casi
 * uniforme alrededor del producto (sharp().trim(), deterministico, sin
 * IA) para que fotos con distinta cantidad de "aire" se vean con un
 * porte visual mas parecido dentro del mismo marco. Nunca deforma, nunca
 * recorta agresivamente el contenido real, y nunca rompe la entrega de
 * la imagen ante un fallo de procesamiento.
 */

/** Canvas cuadrado con fondo uniforme y un cuadrado de color solido centrado -- simula una foto con mucho margen vacio alrededor del producto. */
async function imageWithLargeMargin(): Promise<Buffer> {
  const subject = await sharp({
    create: { width: 40, height: 40, channels: 3, background: { r: 20, g: 20, b: 20 } }
  })
    .png()
    .toBuffer();

  return sharp({
    create: { width: 200, height: 200, channels: 3, background: { r: 255, g: 255, b: 255 } }
  })
    .composite([{ input: subject, gravity: "center" }])
    .webp({ quality: 90 })
    .toBuffer();
}

/**
 * Ruido aleatorio en todo el cuadro (ningun pixel vecino coincide dentro del
 * umbral de similitud): no existe un borde de color uniforme que recortar
 * desde ningun lado, sin importar cual pixel se use como referencia.
 */
async function imageWithoutMargin(): Promise<Buffer> {
  const width = 200;
  const height = 200;
  const channels = 3;
  // Patron pseudoaleatorio determinista (no Math.random()): reproducible
  // entre corridas, sin ningun riesgo de flakiness por azar real.
  const raw = Buffer.alloc(width * height * channels);
  for (let i = 0; i < raw.length; i += 1) {
    raw[i] = (i * 2654435761) % 256;
  }

  return sharp(raw, { raw: { width, height, channels } }).webp({ quality: 90 }).toBuffer();
}

/** Un solo color solido en todo el cuadro: sin ningun contenido distinguible del "fondo". Caso degenerado que la red de seguridad debe descartar. */
async function imageFullyUniform(): Promise<Buffer> {
  return sharp({
    create: { width: 200, height: 200, channels: 3, background: { r: 128, g: 128, b: 128 } }
  })
    .webp({ quality: 90 })
    .toBuffer();
}

describe("trimProductImageMargins", () => {
  it("recorta el margen de fondo cuando el producto ocupa una porcion chica del cuadro", async () => {
    const input = await imageWithLargeMargin();
    const result = await trimProductImageMargins(input);

    expect(result.trimmed).toBe(true);

    const meta = await sharp(result.buffer).metadata();
    // El cuadrado central mide 40x40 sobre un lienzo de 200x200: el
    // resultado recortado debe ser sustancialmente mas chico que el
    // original, nunca mas grande ni igual.
    expect(meta.width ?? 0).toBeLessThan(150);
    expect(meta.height ?? 0).toBeLessThan(150);
  });

  it("no recorta (ni deforma) cuando el contenido ya llena el cuadro sin margen", async () => {
    const input = await imageWithoutMargin();
    const inputMeta = await sharp(input).metadata();

    const result = await trimProductImageMargins(input);
    const meta = await sharp(result.buffer).metadata();

    // Sin margen que quitar: el tamano debe quedar practicamente identico
    // (tolerancia minima por si el codec introduce un borde de 1-2px).
    expect(meta.width ?? 0).toBeGreaterThanOrEqual((inputMeta.width ?? 0) - 2);
    expect(meta.height ?? 0).toBeGreaterThanOrEqual((inputMeta.height ?? 0) - 2);
  });

  it("descarta el recorte si el resultado es sospechosamente agresivo (imagen sin contenido distinguible)", async () => {
    const input = await imageFullyUniform();
    const result = await trimProductImageMargins(input);

    // sharp().trim() reduciria una imagen totalmente uniforme a casi nada;
    // la red de seguridad debe preferir servir la imagen original intacta.
    expect(result.trimmed).toBe(false);
    expect(result.buffer).toBe(input);
  });

  it("nunca lanza ante un buffer invalido: devuelve la entrada original sin recortar", async () => {
    const input = Buffer.from("esto no es una imagen valida");
    const result = await trimProductImageMargins(input);

    expect(result.trimmed).toBe(false);
    expect(result.buffer).toBe(input);
  });

  it("nunca deforma: la relacion de aspecto del contenido recortado se mantiene proporcional", async () => {
    const input = await imageWithLargeMargin();
    const result = await trimProductImageMargins(input);
    const meta = await sharp(result.buffer).metadata();

    // El sujeto original es un cuadrado perfecto (40x40): el recorte debe
    // seguir siendo aproximadamente cuadrado, nunca estirado en un eje.
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    const ratio = width / height;
    expect(ratio).toBeGreaterThan(0.8);
    expect(ratio).toBeLessThan(1.25);
  });
});
