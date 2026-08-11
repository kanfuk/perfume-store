import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Confirma que ProductCard (imageFit="contain", el camino de Top 15 y
 * catalogo completo) efectivamente pasa el zoom de lib/product-image-
 * visual-scale.ts a ProductImageFrame -- y que la variante imageFit=
 * "cover" (Ofertas/carrito) NO lo recibe, quedando exactamente igual que
 * antes.
 */
const source = readFileSync("components/shared/ProductCard.tsx", "utf8");

describe("ProductCard: wiring de visualScale", () => {
  it("importa getProductImageVisualScale", () => {
    expect(source).toMatch(/import\s*\{\s*getProductImageVisualScale\s*\}\s*from\s*"@\/lib\/product-image-visual-scale"/);
  });

  it("pasa visualScale={getProductImageVisualScale(product.id)} a ProductImageFrame", () => {
    expect(source).toMatch(/visualScale=\{getProductImageVisualScale\(product\.id\)\}/);
  });

  it("la rama imageFit=\"cover\" (Ofertas/carrito) no usa ProductImageFrame ni visualScale", () => {
    const coverBranchMatch = source.match(/\) : \(\s*<div className="relative min-w-0 aspect-\[4\/3\][\s\S]*?<\/div>\s*\)\}/);
    expect(coverBranchMatch).not.toBeNull();
    expect(coverBranchMatch?.[0]).not.toContain("ProductImageFrame");
    expect(coverBranchMatch?.[0]).not.toContain("visualScale");
  });
});
