import { describe, expect, it } from "vitest";
import { findProductById, productHasExpectedImage } from "@/lib/product-image-verify.ts";

describe("productHasExpectedImage", () => {
  const expected = {
    imageStoragePath: "products/producto-1/nuevo.webp",
    imageUrl: "https://storage.example/product-images/products/producto-1/nuevo.webp"
  };

  it("true cuando ambos campos coinciden exactamente", () => {
    expect(
      productHasExpectedImage(
        { imageStoragePath: expected.imageStoragePath, imageUrl: expected.imageUrl },
        expected
      )
    ).toBe(true);
  });

  it("false si el producto es null (respuesta ausente o aun no propagada)", () => {
    expect(productHasExpectedImage(null, expected)).toBe(false);
  });

  it("false si el producto es undefined", () => {
    expect(productHasExpectedImage(undefined, expected)).toBe(false);
  });

  it("false si imageStoragePath no coincide (relectura todavia ve la ruta anterior)", () => {
    expect(
      productHasExpectedImage(
        { imageStoragePath: "products/producto-1/viejo.webp", imageUrl: expected.imageUrl },
        expected
      )
    ).toBe(false);
  });

  it("false si imageUrl no coincide", () => {
    expect(
      productHasExpectedImage(
        { imageStoragePath: expected.imageStoragePath, imageUrl: "https://storage.example/otra.webp" },
        expected
      )
    ).toBe(false);
  });
});

describe("findProductById", () => {
  const products = [
    { id: "a", nombre: "Uno" },
    { id: "b", nombre: "Dos" }
  ];

  it("devuelve el producto cuyo id coincide", () => {
    expect(findProductById(products, "b")?.nombre).toBe("Dos");
  });

  it("devuelve null si ningun id coincide", () => {
    expect(findProductById(products, "no-existe")).toBeNull();
  });

  it("devuelve null para una lista vacia", () => {
    expect(findProductById([], "a")).toBeNull();
  });
});
