import { describe, expect, it } from "vitest";
import {
  DEFAULT_MARKUP_PERCENTAGE,
  calculateSuggestedPrice,
  calculateMarkupPercentageFromPrice,
  calculateEstimatedProfit
} from "@/lib/product-pricing.ts";
import { calculateSalePrice } from "@/lib/catalog-import/supplier-import.ts";

/**
 * Reutiliza la MISMA formula que ya usa el importador CSV (recargo sobre
 * costo: precioVenta = costo * (1 + porcentaje/100), redondeado) -- no crea
 * una convencion nueva para el formulario manual.
 */
describe("calculateSuggestedPrice reutiliza calculateSalePrice del importador", () => {
  it("coincide exactamente con calculateSalePrice para el margen predeterminado (35%)", () => {
    expect(DEFAULT_MARKUP_PERCENTAGE).toBe(35);
    const costo = 40000;
    expect(calculateSuggestedPrice(costo, 35)).toBe(calculateSalePrice(costo, 35));
    expect(calculateSuggestedPrice(costo, 35)).toBe(54000);
  });

  it("recalcula al ajustar el margen", () => {
    expect(calculateSuggestedPrice(40000, 50)).toBe(60000);
    expect(calculateSuggestedPrice(40000, 0)).toBe(40000);
  });

  it("nunca produce NaN/Infinity con entradas invalidas", () => {
    expect(calculateSuggestedPrice(NaN, 35)).toBe(0);
    expect(calculateSuggestedPrice(40000, NaN)).toBe(0);
    expect(calculateSuggestedPrice(-1000, 35)).toBe(0); // costo negativo se trata como 0
  });
});

describe("calculateMarkupPercentageFromPrice (inversa, solo para el formulario manual)", () => {
  it("recupera el mismo porcentaje que se uso para llegar al precio", () => {
    const costo = 40000;
    const precio = calculateSuggestedPrice(costo, 35);
    expect(calculateMarkupPercentageFromPrice(costo, precio)).toBe(35);
  });

  it("recalcula el porcentaje si el precio se edita manualmente", () => {
    expect(calculateMarkupPercentageFromPrice(40000, 60000)).toBe(50);
    expect(calculateMarkupPercentageFromPrice(40000, 40000)).toBe(0);
  });

  it("costo cero o invalido no produce NaN/Infinity: devuelve 0", () => {
    expect(calculateMarkupPercentageFromPrice(0, 50000)).toBe(0);
    expect(calculateMarkupPercentageFromPrice(NaN, 50000)).toBe(0);
    expect(calculateMarkupPercentageFromPrice(40000, NaN)).toBe(0);
  });

  it("ida y vuelta (costo+margen -> precio -> margen) es estable", () => {
    const costo = 33000;
    for (const margen of [0, 10, 35, 50, 100]) {
      const precio = calculateSuggestedPrice(costo, margen);
      expect(calculateMarkupPercentageFromPrice(costo, precio)).toBeCloseTo(margen, 0);
    }
  });
});

describe("calculateEstimatedProfit", () => {
  it("venta menos costo", () => {
    expect(calculateEstimatedProfit(40000, 54000)).toBe(14000);
  });

  it("puede ser negativa si el precio manual queda bajo el costo (no se oculta al admin)", () => {
    expect(calculateEstimatedProfit(40000, 30000)).toBe(-10000);
  });

  it("entradas invalidas no producen NaN", () => {
    expect(calculateEstimatedProfit(NaN, 1000)).toBe(0);
  });
});
