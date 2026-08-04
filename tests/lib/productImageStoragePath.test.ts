import { describe, expect, it } from "vitest";
import { isValidProductImageStoragePath } from "@/lib/product-image-storage-path";

/**
 * Validador estricto usado tanto por app/api/product-images/[...path]/
 * route.ts (path que llega en la URL entrante) como por
 * lib/product-image-render.ts (path extraido de una URL publica de Supabase
 * ya persistida). Una ruta administrada real SIEMPRE es
 * `products/{productId}/{uuid}.webp` -- exactamente 3 segmentos, charset
 * seguro, extension .webp fija.
 */
describe("isValidProductImageStoragePath", () => {
  it("acepta una ruta UUID valida con la forma products/{id}/{uuid}.webp", () => {
    expect(
      isValidProductImageStoragePath("products/70a271b8-6021-4e3c-b0e3-05af7e867c9b/4d94ba8b-1073-4cef-931b-2eefa39be632.webp")
    ).toBe(true);
  });

  it("acepta un productId con caracteres seguros no-UUID (alfanumerico, guion, guion bajo)", () => {
    expect(isValidProductImageStoragePath("products/producto_1-test/abc-123.webp")).toBe(true);
  });

  it("rechaza path vacio", () => {
    expect(isValidProductImageStoragePath("")).toBe(false);
  });

  it("rechaza traversal (..)", () => {
    expect(isValidProductImageStoragePath("products/../../etc/passwd")).toBe(false);
    expect(isValidProductImageStoragePath("products/producto-1/../secreto.webp")).toBe(false);
  });

  it("rechaza backslashes", () => {
    expect(isValidProductImageStoragePath("products\\producto-1\\uuid.webp")).toBe(false);
    expect(isValidProductImageStoragePath("products/producto-1/uuid\\evil.webp")).toBe(false);
  });

  it("rechaza rutas absolutas (barra inicial)", () => {
    expect(isValidProductImageStoragePath("/products/producto-1/uuid.webp")).toBe(false);
  });

  it("rechaza query injection (? o #)", () => {
    expect(isValidProductImageStoragePath("products/producto-1/uuid.webp?x=1")).toBe(false);
    expect(isValidProductImageStoragePath("products/producto-1/uuid.webp#frag")).toBe(false);
  });

  it("rechaza un bucket/prefijo distinto de products", () => {
    expect(isValidProductImageStoragePath("otro-bucket/producto-1/uuid.webp")).toBe(false);
    expect(isValidProductImageStoragePath("secretos/producto-1/uuid.webp")).toBe(false);
  });

  it("rechaza una extension no admitida (solo .webp es valido)", () => {
    expect(isValidProductImageStoragePath("products/producto-1/uuid.png")).toBe(false);
    expect(isValidProductImageStoragePath("products/producto-1/uuid.jpg")).toBe(false);
    expect(isValidProductImageStoragePath("products/producto-1/uuid")).toBe(false);
    expect(isValidProductImageStoragePath("products/producto-1/uuid.webp.exe")).toBe(false);
  });

  it("rechaza mas o menos de 3 segmentos", () => {
    expect(isValidProductImageStoragePath("products/uuid.webp")).toBe(false);
    expect(isValidProductImageStoragePath("products")).toBe(false);
    expect(isValidProductImageStoragePath("products/producto-1/sub/uuid.webp")).toBe(false);
  });

  it("rechaza segmentos vacios (barras dobles / al final)", () => {
    expect(isValidProductImageStoragePath("products//uuid.webp")).toBe(false);
    expect(isValidProductImageStoragePath("products/producto-1/")).toBe(false);
  });

  it("rechaza caracteres inseguros en los segmentos (espacios, puntos, comodines)", () => {
    expect(isValidProductImageStoragePath("products/producto 1/uuid.webp")).toBe(false);
    expect(isValidProductImageStoragePath("products/*/uuid.webp")).toBe(false);
    expect(isValidProductImageStoragePath("products/producto.1/uuid.webp")).toBe(false);
  });

  it("rechaza una ruta anormalmente larga", () => {
    const longSegment = "a".repeat(500);
    expect(isValidProductImageStoragePath(`products/${longSegment}/uuid.webp`)).toBe(false);
  });
});
