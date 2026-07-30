import { describe, expect, it } from "vitest";
import {
  validateSalePriceInput,
  roundPriceToStep,
  isValidRoundingStep,
  calculateAutoPrice,
  applyPercentageAdjustment,
  applyFixedAdjustment
} from "@/lib/pricing";

describe("pricing - validateSalePriceInput", () => {
  it("acepta un entero positivo", () => {
    expect(validateSalePriceInput(65000)).toEqual({ value: 65000, error: null });
  });

  it("rechaza vacio", () => {
    expect(validateSalePriceInput("").error).toMatch(/no puede estar vacío/);
    expect(validateSalePriceInput(null).error).toMatch(/no puede estar vacío/);
    expect(validateSalePriceInput(undefined).error).toMatch(/no puede estar vacío/);
  });

  it("rechaza NaN / no numerico", () => {
    expect(validateSalePriceInput("abc").error).toMatch(/número válido/);
    expect(validateSalePriceInput(NaN).error).toMatch(/número válido/);
  });

  it("rechaza negativos y cero", () => {
    expect(validateSalePriceInput(-100).error).toMatch(/mayor que 0/);
    expect(validateSalePriceInput(0).error).toMatch(/mayor que 0/);
  });

  it("rechaza decimales (debe ser entero)", () => {
    expect(validateSalePriceInput(1000.5).error).toMatch(/entero/);
  });
});

describe("pricing - redondeo", () => {
  it("valida pasos permitidos (100/500/1000)", () => {
    expect(isValidRoundingStep(100)).toBe(true);
    expect(isValidRoundingStep(500)).toBe(true);
    expect(isValidRoundingStep(1000)).toBe(true);
    expect(isValidRoundingStep(250)).toBe(false);
    expect(isValidRoundingStep("100")).toBe(false);
  });

  it("redondea al paso mas cercano", () => {
    expect(roundPriceToStep(78349, 100)).toBe(78300);
    expect(roundPriceToStep(78350, 100)).toBe(78400);
    expect(roundPriceToStep(78300, 500)).toBe(78500);
    expect(roundPriceToStep(78300, 1000)).toBe(78000);
  });
});

describe("pricing - calculateAutoPrice", () => {
  it("caso obligatorio: costo 58000 + 35% = 78300", () => {
    expect(calculateAutoPrice(58000, 35)).toBe(78300);
  });
});

describe("pricing - ajustes de edicion masiva", () => {
  it("ajusta por porcentaje (positivo y negativo)", () => {
    expect(applyPercentageAdjustment(60000, 10)).toBe(66000);
    expect(applyPercentageAdjustment(60000, -10)).toBe(54000);
  });

  it("ajusta por monto fijo (positivo y negativo)", () => {
    expect(applyFixedAdjustment(60000, 5000)).toBe(65000);
    expect(applyFixedAdjustment(60000, -5000)).toBe(55000);
  });
});
