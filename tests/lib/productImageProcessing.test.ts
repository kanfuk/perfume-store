import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  ProductImageProcessingError,
  processProductImage
} from "@/lib/product-image-processing";
import { PRODUCT_IMAGE_CONFIG } from "@/lib/product-image-config";

async function createSyntheticImage(
  options: {
    width: number;
    height: number;
    format?: "jpeg" | "png" | "webp";
    alpha?: boolean;
    orientation?: number;
  }
): Promise<Buffer> {
  const { width, height, format = "jpeg", alpha = false, orientation } = options;
  let image = sharp({
    create: {
      width,
      height,
      channels: alpha ? 4 : 3,
      background: alpha ? { r: 200, g: 50, b: 50, alpha: 0.5 } : { r: 200, g: 50, b: 50 }
    }
  });

  if (format === "jpeg") image = image.jpeg();
  if (format === "png") image = image.png();
  if (format === "webp") image = image.webp();

  if (orientation !== undefined) {
    image = image.withMetadata({ orientation });
  }

  return image.toBuffer();
}

function buildHeicBuffer(): Buffer {
  return Buffer.concat([
    Buffer.from([0, 0, 0, 24]),
    Buffer.from("ftypheic", "ascii"),
    Buffer.alloc(8)
  ]);
}

const ONE_BY_ONE_GIF_BASE64 =
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7";

describe("processProductImage", () => {
  it("acepta JPEG valido y convierte a webp", async () => {
    const input = await createSyntheticImage({ width: 400, height: 300, format: "jpeg" });
    const result = await processProductImage(input);

    expect(result.format).toBe("webp");
    expect(result.width).toBe(400);
    expect(result.height).toBe(300);
    expect(result.size).toBe(result.buffer.length);
  });

  it("acepta PNG valido", async () => {
    const input = await createSyntheticImage({ width: 200, height: 200, format: "png" });
    const result = await processProductImage(input);
    expect(result.format).toBe("webp");
  });

  it("acepta WebP valido", async () => {
    const input = await createSyntheticImage({ width: 200, height: 200, format: "webp" });
    const result = await processProductImage(input);
    expect(result.format).toBe("webp");
  });

  it("corrige la orientacion EXIF (rota fisicamente los pixeles)", async () => {
    // 400x300 fisico, orientation=6 (rotar 90 CW): el resultado visualmente
    // correcto es 300x400 y sin bandera de orientacion.
    const input = await createSyntheticImage({
      width: 400,
      height: 300,
      format: "jpeg",
      orientation: 6
    });
    const result = await processProductImage(input);
    expect(result.width).toBe(300);
    expect(result.height).toBe(400);
  });

  it("preserva la proporcion y limita el lado mayor a 1600px (horizontal)", async () => {
    const input = await createSyntheticImage({ width: 3000, height: 1500, format: "jpeg" });
    const result = await processProductImage(input);
    expect(result.width).toBe(PRODUCT_IMAGE_CONFIG.maxOutputDimension);
    expect(result.height).toBe(800);
  });

  it("preserva la proporcion y limita el lado mayor a 1600px (vertical)", async () => {
    const input = await createSyntheticImage({ width: 1500, height: 3000, format: "jpeg" });
    const result = await processProductImage(input);
    expect(result.height).toBe(PRODUCT_IMAGE_CONFIG.maxOutputDimension);
    expect(result.width).toBe(800);
  });

  it("preserva la proporcion cuadrada al limitar el lado mayor", async () => {
    const input = await createSyntheticImage({ width: 2000, height: 2000, format: "jpeg" });
    const result = await processProductImage(input);
    expect(result.width).toBe(PRODUCT_IMAGE_CONFIG.maxOutputDimension);
    expect(result.height).toBe(PRODUCT_IMAGE_CONFIG.maxOutputDimension);
  });

  it("nunca agranda una imagen mas chica que el limite", async () => {
    const input = await createSyntheticImage({ width: 300, height: 200, format: "jpeg" });
    const result = await processProductImage(input);
    expect(result.width).toBe(300);
    expect(result.height).toBe(200);
  });

  it("preserva transparencia de PNG con alfa al convertir a webp", async () => {
    const input = await createSyntheticImage({
      width: 100,
      height: 100,
      format: "png",
      alpha: true
    });
    const result = await processProductImage(input);
    const outMeta = await sharp(result.buffer).metadata();
    expect(outMeta.hasAlpha).toBe(true);
  });

  it("remueve metadata innecesaria (sin EXIF en la salida)", async () => {
    const input = await createSyntheticImage({ width: 200, height: 200, format: "jpeg" });
    const result = await processProductImage(input);
    const outMeta = await sharp(result.buffer).metadata();
    expect(outMeta.exif).toBeUndefined();
  });

  it("rechaza SVG", async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'
    );
    await expect(processProductImage(svg)).rejects.toMatchObject({
      code: "UNSUPPORTED_FORMAT"
    });
  });

  it("rechaza GIF", async () => {
    const gif = Buffer.from(ONE_BY_ONE_GIF_BASE64, "base64");
    await expect(processProductImage(gif)).rejects.toBeInstanceOf(ProductImageProcessingError);
  });

  it("rechaza un buffer con firma/magic bytes invalidos", async () => {
    const junk = Buffer.from("esto no es una imagen, es texto plano".repeat(10));
    await expect(processProductImage(junk)).rejects.toMatchObject({ code: "DECODE_FAILED" });
  });

  it("rechaza un archivo corrupto (JPEG truncado)", async () => {
    const valid = await createSyntheticImage({ width: 200, height: 200, format: "jpeg" });
    const truncated = valid.subarray(0, Math.floor(valid.length / 3));
    await expect(processProductImage(truncated)).rejects.toMatchObject({ code: "DECODE_FAILED" });
  });

  it("rechaza un buffer vacio", async () => {
    await expect(processProductImage(Buffer.alloc(0))).rejects.toMatchObject({
      code: "EMPTY_BUFFER"
    });
  });

  it("detecta HEIC/HEIF y devuelve el mensaje amigable sin intentar decodificar", async () => {
    await expect(processProductImage(buildHeicBuffer())).rejects.toMatchObject({
      code: "HEIC_UNSUPPORTED",
      message: "Este formato no es compatible. Convierte la imagen a JPG, PNG o WebP."
    });
  });
});
