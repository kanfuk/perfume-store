import { describe, expect, it } from "vitest";
import { computeCatalogSummary, type CatalogSummaryProductInput } from "@/lib/catalog-summary.ts";

function product(overrides: Partial<CatalogSummaryProductInput> = {}): CatalogSummaryProductInput {
  return {
    nombre: "Lady Million",
    marca: "Paco Rabanne",
    contenido: "80ML",
    precioVenta: 67500,
    activo: true,
    stockActual: 5,
    modoPrecio: "AUTO",
    esTop: false,
    ...overrides
  };
}

describe("catalog-summary - computeCatalogSummary (Fase 3A, resumen de Gestion de catalogo)", () => {
  it("catalogo vacio: todos los conteos en 0, top12Pendientes = limite completo", () => {
    const summary = computeCatalogSummary([], 12);
    expect(summary).toEqual({
      total: 0,
      activos: 0,
      pausados: 0,
      disponibles: 0,
      sinStock: 0,
      incompletos: 0,
      preciosAuto: 0,
      preciosManual: 0,
      top12Asignados: 0,
      top12Pendientes: 12
    });
  });

  it("cuenta activos vs pausados", () => {
    const summary = computeCatalogSummary([
      product({ activo: true }),
      product({ activo: true }),
      product({ activo: false })
    ]);
    expect(summary.total).toBe(3);
    expect(summary.activos).toBe(2);
    expect(summary.pausados).toBe(1);
  });

  it("disponibles = activo Y con stock (no basta con estar activo)", () => {
    const summary = computeCatalogSummary([
      product({ activo: true, stockActual: 5 }), // disponible
      product({ activo: true, stockActual: 0 }), // activo pero sin stock: no disponible
      product({ activo: false, stockActual: 5 }) // pausado con stock: no disponible
    ]);
    expect(summary.disponibles).toBe(1);
  });

  it("sinStock cuenta stock <= 0 sin importar si esta activo o pausado", () => {
    const summary = computeCatalogSummary([
      product({ activo: true, stockActual: 0 }),
      product({ activo: false, stockActual: 0 }),
      product({ activo: true, stockActual: 3 })
    ]);
    expect(summary.sinStock).toBe(2);
  });

  it("incompletos usa la misma regla que lib/catalog-completeness.ts (nunca inventa datos)", () => {
    const summary = computeCatalogSummary([
      product({ marca: "" }), // incompleto: sin marca
      product({ contenido: "" }), // incompleto: sin contenido
      product() // completo
    ]);
    expect(summary.incompletos).toBe(2);
  });

  it("preciosAuto + preciosManual siempre suman el total", () => {
    const summary = computeCatalogSummary([
      product({ modoPrecio: "AUTO" }),
      product({ modoPrecio: "MANUAL" }),
      product({ modoPrecio: "MANUAL" }),
      product({ modoPrecio: undefined }) // sin modoPrecio explicito cuenta como AUTO
    ]);
    expect(summary.preciosManual).toBe(2);
    expect(summary.preciosAuto).toBe(2);
    expect(summary.preciosAuto + summary.preciosManual).toBe(summary.total);
  });

  it("top12Asignados cuenta productos con esTop=true; top12Pendientes nunca es negativo", () => {
    const summary = computeCatalogSummary(
      [product({ esTop: true }), product({ esTop: true }), product({ esTop: false })],
      2
    );
    expect(summary.top12Asignados).toBe(2);
    expect(summary.top12Pendientes).toBe(0); // 2 - 2, nunca negativo aunque hubiera mas asignados que el limite

    const overAssigned = computeCatalogSummary(
      [product({ esTop: true }), product({ esTop: true }), product({ esTop: true })],
      2
    );
    expect(overAssigned.top12Pendientes).toBe(0);
  });

  it("usa TOP_PRODUCTS_LIMIT (12) como limite por defecto sin necesidad de pasarlo explicitamente", () => {
    const summary = computeCatalogSummary([product({ esTop: true })]);
    expect(summary.top12Pendientes).toBe(11);
  });

  it("nunca retorna una lista de productos, solo numeros", () => {
    const summary = computeCatalogSummary([product(), product()]);
    for (const value of Object.values(summary)) {
      expect(typeof value).toBe("number");
    }
  });
});
