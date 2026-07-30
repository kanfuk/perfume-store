import { describe, expect, it } from "vitest";
import { reconcile } from "@/lib/catalog-import/reconciliation.ts";
import { buildCanonicalCatalog } from "@/lib/catalog-import/canonical.ts";
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

describe("catalog-import/canonical", () => {
  it("el Precio Compra de julio se trata como costo, nunca como precio de venta", () => {
    const summary = reconcile([julioRow({ perfume: "Solo julio" })], []);
    const { products } = buildCanonicalCatalog(summary.entries);
    expect(products).toHaveLength(1);
    expect(products[0].costoUnitario).toBe(65000);
    expect(products[0].precioVenta).toBeNull();
    expect(products[0].origenCosto).toBe("julio");
    expect(products[0].origenPrecio).toBeNull();
  });

  it("el precio de venta solo viene de junio", () => {
    const summary = reconcile([julioRow()], [junioRow()]);
    const { products } = buildCanonicalCatalog(summary.entries);
    expect(products[0].precioVenta).toBe(65000);
    expect(products[0].origenPrecio).toBe("junio");
  });

  it("nunca infiere stock: siempre queda null y bloquea activo", () => {
    const summary = reconcile([julioRow()], [junioRow()]);
    const { products } = buildCanonicalCatalog(summary.entries);
    expect(products[0].stock).toBeNull();
    expect(products[0].activo).toBe(false);
    expect(products[0].estadoDatos).toBe("FALTA_STOCK");
  });

  it("productos solo-junio no se activan automaticamente", () => {
    const summary = reconcile([], [junioRow({ perfume: "Solo junio" })]);
    const { products } = buildCanonicalCatalog(summary.entries);
    expect(products[0].classification).toBe("SOLO_JUNIO");
    expect(products[0].activo).toBe(false);
  });

  it("las entradas AMBIGUO quedan fuera del catalogo canonico (van a revision)", () => {
    const summary = reconcile(
      [julioRow({ perfume: "Myslf Eau de parfm", marca: "Yves Saint Lauren", contenido: "100 ml" })],
      [junioRow({ perfume: "Myself Eau de parfm", marca: "Yves Saint Lauren", contenido: "100 ml" })]
    );
    const { products, reviewEntries } = buildCanonicalCatalog(summary.entries);
    expect(products).toHaveLength(0);
    expect(reviewEntries.every((e) => e.classification === "AMBIGUO")).toBe(true);
  });

  it("asigna SKU determinista y unico a cada producto canonico", () => {
    const summary = reconcile([julioRow()], [junioRow()]);
    const { products } = buildCanonicalCatalog(summary.entries);
    expect(products[0].sku).toBe("SML-CAROLINA-HERRERA-LA-BOMBA-80ML");
  });
});
