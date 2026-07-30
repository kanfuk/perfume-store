import { describe, expect, it } from "vitest";
import { filterAndSortProducts, getAvailableBrands } from "@/lib/catalog-search";
import type { ProductRecord } from "@/lib/types";

function product(overrides: Partial<ProductRecord> = {}): ProductRecord {
  return {
    id: overrides.id ?? "id",
    nombre: "La Bomba",
    marca: "Carolina Herrera",
    sku: "SML-1",
    precioVenta: 65000,
    activo: true,
    ...overrides
  };
}

describe("catalog-search - filterAndSortProducts", () => {
  const products = [
    product({ id: "1", nombre: "La Bomba", marca: "Carolina Herrera", sku: "SML-CH-1", precioVenta: 65000 }),
    product({ id: "2", nombre: "Sauvage", marca: "Christian Dior", sku: "SML-CD-1", precioVenta: 80000 }),
    product({ id: "3", nombre: "212 Vip", marca: "Carolina Herrera", sku: "SML-CH-2", precioVenta: 40000 })
  ];

  it("busca por nombre", () => {
    const result = filterAndSortProducts(products, { query: "bomba" });
    expect(result.map((p) => p.id)).toEqual(["1"]);
  });

  it("busca por marca", () => {
    const result = filterAndSortProducts(products, { query: "dior" });
    expect(result.map((p) => p.id)).toEqual(["2"]);
  });

  it("busca por SKU", () => {
    const result = filterAndSortProducts(products, { query: "sml-cd-1" });
    expect(result.map((p) => p.id)).toEqual(["2"]);
  });

  it("busqueda ignora tildes y mayusculas", () => {
    const result = filterAndSortProducts(
      [product({ id: "4", nombre: "Sí passion" })],
      { query: "si passion" }
    );
    expect(result).toHaveLength(1);
  });

  it("filtra por marca exacta", () => {
    const result = filterAndSortProducts(products, { brand: "Carolina Herrera" });
    expect(result.map((p) => p.id).sort()).toEqual(["1", "3"]);
  });

  it("combina busqueda y filtro de marca", () => {
    const result = filterAndSortProducts(products, { query: "vip", brand: "Carolina Herrera" });
    expect(result.map((p) => p.id)).toEqual(["3"]);
  });

  it("ordena por nombre ascendente por defecto", () => {
    const result = filterAndSortProducts(products, {});
    expect(result.map((p) => p.nombre)).toEqual(["212 Vip", "La Bomba", "Sauvage"]);
  });

  it("recomendados preserva el orden recibido", () => {
    const result = filterAndSortProducts(products, { sort: "recomendados" });
    expect(result.map((p) => p.id)).toEqual(["1", "2", "3"]);
  });

  it("ordena por precio ascendente", () => {
    const result = filterAndSortProducts(products, { sort: "precio-asc" });
    expect(result.map((p) => p.precioVenta)).toEqual([40000, 65000, 80000]);
  });

  it("ordena por precio descendente", () => {
    const result = filterAndSortProducts(products, { sort: "precio-desc" });
    expect(result.map((p) => p.precioVenta)).toEqual([80000, 65000, 40000]);
  });

  it("sin coincidencias devuelve lista vacia", () => {
    const result = filterAndSortProducts(products, { query: "producto-inexistente" });
    expect(result).toHaveLength(0);
  });
});

describe("catalog-search - getAvailableBrands", () => {
  it("devuelve marcas unicas ordenadas alfabeticamente", () => {
    const brands = getAvailableBrands([
      product({ marca: "Dior" }),
      product({ marca: "Carolina Herrera" }),
      product({ marca: "Dior" })
    ]);
    expect(brands).toEqual(["Carolina Herrera", "Dior"]);
  });
});
