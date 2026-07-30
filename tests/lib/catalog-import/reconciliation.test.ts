import { describe, expect, it } from "vitest";
import { reconcile } from "@/lib/catalog-import/reconciliation.ts";
import type { RawSourceRow } from "@/lib/catalog-import/types.ts";

function julioRow(overrides: Partial<RawSourceRow> = {}): RawSourceRow {
  return {
    sheet: "julio",
    rowNumber: 2,
    perfume: "La Bomba",
    marca: "Carolina Herrera",
    contenido: "80ml",
    precioCompra: 65000,
    ...overrides
  };
}

function junioRow(overrides: Partial<RawSourceRow> = {}): RawSourceRow {
  return {
    sheet: "junio",
    rowNumber: 2,
    perfume: "La Bomba",
    marca: "Carolina Herrera",
    contenido: "80ml",
    costoUnitario: 45000,
    precioVenta: 65000,
    ...overrides
  };
}

describe("catalog-import/reconciliation", () => {
  it("clasifica MATCH_EXACTO cuando marca/nombre/contenido son identicos byte a byte", () => {
    const summary = reconcile([julioRow()], [junioRow()]);
    expect(summary.entries).toHaveLength(1);
    expect(summary.entries[0].classification).toBe("MATCH_EXACTO");
  });

  it("clasifica MATCH_NORMALIZADO cuando solo difieren espacios/mayusculas", () => {
    const summary = reconcile(
      [julioRow({ perfume: "La Bomba " })],
      [junioRow({ perfume: "la bomba" })]
    );
    expect(summary.entries[0].classification).toBe("MATCH_NORMALIZADO");
  });

  it("clasifica SOLO_JULIO cuando el producto no existe en junio", () => {
    const summary = reconcile([julioRow({ perfume: "Producto exclusivo julio" })], []);
    expect(summary.entries[0].classification).toBe("SOLO_JULIO");
  });

  it("clasifica SOLO_JUNIO cuando el producto no existe en julio", () => {
    const summary = reconcile([], [junioRow({ perfume: "Producto exclusivo junio" })]);
    expect(summary.entries[0].classification).toBe("SOLO_JUNIO");
  });

  it("nunca fusiona automaticamente contenidos distintos (30ml vs 50ml)", () => {
    const summary = reconcile(
      [julioRow({ contenido: "30ml" })],
      [junioRow({ contenido: "50ml" })]
    );
    const classifications = summary.entries.map((e) => e.classification);
    expect(classifications).toEqual(expect.arrayContaining(["SOLO_JULIO", "SOLO_JUNIO"]));
    expect(classifications).not.toContain("MATCH_EXACTO");
    expect(classifications).not.toContain("MATCH_NORMALIZADO");
  });

  it("clasifica AMBIGUO ante una posible variante tipografica del nombre, sin fusionar", () => {
    const summary = reconcile(
      [julioRow({ perfume: "Myslf Eau de parfm", marca: "Yves Saint Lauren", contenido: "100 ml" })],
      [junioRow({ perfume: "Myself Eau de parfm", marca: "Yves Saint Lauren", contenido: "100 ml" })]
    );
    const classifications = summary.entries.map((e) => e.classification);
    expect(classifications).toEqual(["AMBIGUO", "AMBIGUO"]);
    const julioEntry = summary.entries.find((e) => e.julioRow);
    expect(julioEntry?.candidates?.[0].perfume).toBe("Myself Eau de parfm");
  });

  it("clasifica DUPLICADO cuando la misma clave aparece dos veces en la misma planilla", () => {
    const summary = reconcile(
      [julioRow(), julioRow({ rowNumber: 3 })],
      []
    );
    const classifications = summary.entries.map((e) => e.classification);
    expect(classifications).toContain("SOLO_JULIO");
    expect(classifications).toContain("DUPLICADO");
    expect(summary.duplicatesJulio).toHaveLength(1);
  });

  it("clasifica FILA_INVALIDA cuando falta marca o contenido", () => {
    const summary = reconcile(
      [julioRow({ marca: "" })],
      [junioRow({ contenido: "" })]
    );
    const invalid = summary.entries.filter((e) => e.classification === "FILA_INVALIDA");
    expect(invalid).toHaveLength(2);
    expect(summary.invalidJulio).toHaveLength(1);
    expect(summary.invalidJunio).toHaveLength(1);
  });
});
