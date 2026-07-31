import { describe, expect, it } from "vitest";
import {
  getMissingCatalogFields,
  isProductMetadataComplete,
  describeMissingCatalogFields
} from "@/lib/catalog-completeness.ts";

function product(
  overrides: Partial<{ nombre: string; marca: string | null; contenido: string | null; precioVenta: number }> = {}
) {
  return {
    nombre: "Lady Million",
    marca: "Paco Rabanne",
    contenido: "80ML",
    precioVenta: 67500,
    ...overrides
  };
}

describe("catalog-completeness - getMissingCatalogFields / isProductMetadataComplete", () => {
  it("producto completo: sin campos faltantes", () => {
    expect(getMissingCatalogFields(product())).toEqual([]);
    expect(isProductMetadataComplete(product())).toBe(true);
  });

  it("sin marca: reporta 'marca' como faltante", () => {
    const missing = getMissingCatalogFields(product({ marca: "" }));
    expect(missing).toEqual(["marca"]);
    expect(isProductMetadataComplete(product({ marca: "" }))).toBe(false);
  });

  it("sin contenido: reporta 'contenido' como faltante", () => {
    expect(getMissingCatalogFields(product({ contenido: "" }))).toEqual(["contenido"]);
  });

  it("sin nombre: reporta 'nombre' como faltante", () => {
    expect(getMissingCatalogFields(product({ nombre: "" }))).toEqual(["nombre"]);
  });

  it("precio invalido (<=0, NaN o no numerico): reporta 'precio' como faltante", () => {
    expect(getMissingCatalogFields(product({ precioVenta: 0 }))).toEqual(["precio"]);
    expect(getMissingCatalogFields(product({ precioVenta: -100 }))).toEqual(["precio"]);
    expect(getMissingCatalogFields(product({ precioVenta: NaN }))).toEqual(["precio"]);
  });

  it("multiples campos faltantes se reportan todos, en orden nombre/marca/contenido/precio", () => {
    const missing = getMissingCatalogFields({ nombre: "", marca: "", contenido: "80ML", precioVenta: 1000 });
    expect(missing).toEqual(["nombre", "marca"]);
  });

  it("campos solo con espacios se tratan como vacios (trim)", () => {
    expect(getMissingCatalogFields(product({ marca: "   " }))).toEqual(["marca"]);
  });

  it("nunca inventa un valor: solo reporta que falta, no rellena", () => {
    const missing = getMissingCatalogFields(product({ marca: undefined, contenido: null }));
    expect(missing).toEqual(["marca", "contenido"]);
  });
});

describe("catalog-completeness - describeMissingCatalogFields (texto orientado a accion, no tecnico)", () => {
  it("sin campos faltantes: texto vacio", () => {
    expect(describeMissingCatalogFields([])).toBe("");
  });

  it("un campo: 'Falta marca.'", () => {
    expect(describeMissingCatalogFields(["marca"])).toBe("Falta marca.");
  });

  it("dos campos: 'Falta marca y contenido.'", () => {
    expect(describeMissingCatalogFields(["marca", "contenido"])).toBe("Falta marca y contenido.");
  });

  it("nunca incluye texto tecnico (undefined/null/NaN)", () => {
    const text = describeMissingCatalogFields(["nombre", "marca", "contenido", "precio"]);
    expect(text).not.toMatch(/undefined|null|NaN/i);
  });
});
