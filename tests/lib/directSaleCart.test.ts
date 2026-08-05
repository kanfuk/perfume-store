import { describe, expect, it } from "vitest";
import {
  addLine,
  computeTotal,
  computeTotalUnits,
  removeLine,
  updateQuantity,
  type DirectSaleCartLine
} from "@/lib/direct-sale-cart";
import type { ProductVariant } from "@/lib/product-families";

const family = { marca: "Marca X", nombre: "Perfume X" };

function variant(overrides: Partial<ProductVariant> = {}): ProductVariant {
  return {
    productId: "variant-50ml",
    sku: "SKU-50",
    contenido: "50ML",
    precioVenta: 10000,
    stockActual: 5,
    disponible: true,
    activo: true,
    esTop: false,
    esOfertaSemana: false,
    ...overrides
  };
}

describe("direct-sale-cart", () => {
  it("agrega una variante nueva como linea", () => {
    const lines = addLine([], family, variant(), 1);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      productId: "variant-50ml",
      nombre: "Perfume X",
      marca: "Marca X",
      contenido: "50ML",
      precioVenta: 10000,
      cantidad: 1
    });
  });

  it("incrementa la cantidad de la misma variante en vez de duplicar la linea", () => {
    let lines: DirectSaleCartLine[] = [];
    lines = addLine(lines, family, variant(), 1);
    lines = addLine(lines, family, variant(), 2);

    expect(lines).toHaveLength(1);
    expect(lines[0].cantidad).toBe(3);
  });

  it("nunca supera el stock disponible de la variante al agregar", () => {
    let lines: DirectSaleCartLine[] = [];
    lines = addLine(lines, family, variant({ stockActual: 5 }), 4);
    lines = addLine(lines, family, variant({ stockActual: 5 }), 4);

    expect(lines[0].cantidad).toBe(5);
  });

  it("no agrega una linea si la cantidad solicitada es 0 o invalida", () => {
    const lines = addLine([], family, variant(), 0);
    expect(lines).toHaveLength(0);
  });

  it("updateQuantity disminuye la cantidad de una linea existente", () => {
    let lines = addLine([], family, variant(), 3);
    lines = updateQuantity(lines, "variant-50ml", 1);

    expect(lines[0].cantidad).toBe(1);
  });

  it("updateQuantity nunca supera el stock de esa linea", () => {
    let lines = addLine([], family, variant({ stockActual: 5 }), 2);
    lines = updateQuantity(lines, "variant-50ml", 99);

    expect(lines[0].cantidad).toBe(5);
  });

  it("updateQuantity con 0 o negativo quita la linea (igual que Quitar)", () => {
    let lines = addLine([], family, variant(), 2);
    lines = updateQuantity(lines, "variant-50ml", 0);

    expect(lines).toHaveLength(0);
  });

  it("removeLine quita la linea indicada", () => {
    let lines = addLine([], family, variant(), 1);
    lines = removeLine(lines, "variant-50ml");

    expect(lines).toHaveLength(0);
  });

  it("computeTotal y computeTotalUnits solo sirven para mostrar en pantalla", () => {
    let lines: DirectSaleCartLine[] = [];
    lines = addLine(lines, family, variant({ productId: "a", precioVenta: 10000 }), 2);
    lines = addLine(
      lines,
      { marca: "Marca Y", nombre: "Perfume Y" },
      variant({ productId: "b", precioVenta: 5000, stockActual: 10 }),
      3
    );

    expect(computeTotal(lines)).toBe(2 * 10000 + 3 * 5000);
    expect(computeTotalUnits(lines)).toBe(5);
  });
});
