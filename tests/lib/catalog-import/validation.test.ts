import { describe, expect, it } from "vitest";
import {
  computeEstadoDatos,
  isImportable,
  validatePrecioVenta,
  validateCostoUnitario,
  validateStock
} from "@/lib/catalog-import/validation.ts";

describe("catalog-import/validation", () => {
  it("COMPLETO cuando hay precio y stock", () => {
    expect(computeEstadoDatos(10000, 5)).toBe("COMPLETO");
  });

  it("FALTA_PRECIO cuando el precio es null (nunca 0 como sustituto)", () => {
    expect(computeEstadoDatos(null, 5)).toBe("FALTA_PRECIO");
  });

  it("FALTA_STOCK cuando el stock es null", () => {
    expect(computeEstadoDatos(10000, null)).toBe("FALTA_STOCK");
  });

  it("FALTA_PRECIO|FALTA_STOCK cuando faltan ambos", () => {
    expect(computeEstadoDatos(null, null)).toBe("FALTA_PRECIO|FALTA_STOCK");
  });

  it("stock en 0 (valor real conocido) no es lo mismo que stock null", () => {
    expect(computeEstadoDatos(10000, 0)).toBe("COMPLETO");
  });

  it("isImportable solo es true para estado COMPLETO", () => {
    expect(isImportable("COMPLETO")).toBe(true);
    expect(isImportable("FALTA_PRECIO")).toBe(false);
    expect(isImportable("FALTA_STOCK")).toBe(false);
    expect(isImportable("FALTA_PRECIO|FALTA_STOCK")).toBe(false);
  });

  it("rechaza precio de venta negativo", () => {
    expect(validatePrecioVenta(-1)).toMatch(/negativo/);
    expect(validatePrecioVenta(0)).toBeNull();
    expect(validatePrecioVenta(null)).toBeNull();
  });

  it("rechaza costo unitario negativo", () => {
    expect(validateCostoUnitario(-500)).toMatch(/negativo/);
  });

  it("rechaza stock negativo", () => {
    expect(validateStock(-1)).toMatch(/negativo/);
  });
});
