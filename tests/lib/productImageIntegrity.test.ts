import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { hasValidWebpHeader } from "@/lib/product-image-integrity";

describe("hasValidWebpHeader", () => {
  it("acepta un WebP real producido por Sharp", async () => {
    const webp = await sharp({
      create: { width: 20, height: 20, channels: 3, background: { r: 1, g: 2, b: 3 } }
    })
      .webp()
      .toBuffer();

    expect(hasValidWebpHeader(webp)).toBe(true);
  });

  it("rechaza un buffer vacio", () => {
    expect(hasValidWebpHeader(Buffer.alloc(0))).toBe(false);
  });

  it("rechaza un buffer mas corto que la cabecera minima (12 bytes)", () => {
    expect(hasValidWebpHeader(Buffer.from([0x52, 0x49, 0x46, 0x46]))).toBe(false);
  });

  it("rechaza cuando el bloque RIFF es correcto pero falta el marcador WEBP", () => {
    const buf = Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x41, 0x56, 0x49, 0x46]); // "AVIF" en vez de "WEBP"
    expect(hasValidWebpHeader(buf)).toBe(false);
  });

  it("rechaza el patron real observado: bytes de reemplazo UTF-8 (EF BF BD) donde iba el tamano RIFF", () => {
    const buf = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0xef, 0xbf, 0xbd, 0xef, 0xbf, 0xbd, 0x01, 0x00, 0x57, 0x45, 0x42, 0x50
    ]);
    expect(hasValidWebpHeader(buf)).toBe(false);
  });

  it("rechaza un JPEG (cabecera FFD8FF...) que nunca fue convertido a WebP", () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(hasValidWebpHeader(buf)).toBe(false);
  });
});
