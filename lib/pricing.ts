/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Edicion rapida de precios - logica pura
 * Descripcion: Validacion de precios y operaciones de ajuste (recargo,
 * porcentaje, monto fijo, redondeo). Sin I/O; reutilizada por el servicio
 * y por la ruta API. Nunca confia en valores del navegador: toda operacion
 * server-side debe pasar por estas validaciones antes de escribir.
 */

export type PriceValidationResult = { value: number; error: null } | { value: null; error: string };

/** Precio de venta: entero > 0. Nunca acepta NaN, vacio o negativo. */
export function validateSalePriceInput(raw: unknown): PriceValidationResult {
  if (raw === null || raw === undefined || raw === "") {
    return { value: null, error: "El precio no puede estar vacío." };
  }

  const value = typeof raw === "number" ? raw : Number(raw);

  if (!Number.isFinite(value)) {
    return { value: null, error: "El precio debe ser un número válido." };
  }
  if (!Number.isInteger(value)) {
    return { value: null, error: "El precio debe ser un número entero." };
  }
  if (value <= 0) {
    return { value: null, error: "El precio debe ser mayor que 0." };
  }

  return { value, error: null };
}

export const ROUNDING_STEPS = [100, 500, 1000] as const;
export type RoundingStep = (typeof ROUNDING_STEPS)[number];

export function isValidRoundingStep(value: unknown): value is RoundingStep {
  return typeof value === "number" && (ROUNDING_STEPS as readonly number[]).includes(value);
}

export function roundPriceToStep(price: number, step: RoundingStep): number {
  return Math.round(price / step) * step;
}

/** precio_venta = Math.round(costo * (1 + porcentaje / 100)) — recalculo desde costo (modo AUTO). */
export function calculateAutoPrice(costoUnitario: number, markupPercentage: number): number {
  return Math.round(costoUnitario * (1 + markupPercentage / 100));
}

/** Ajusta un precio existente +/- un porcentaje (no parte del costo: queda en modo MANUAL). */
export function applyPercentageAdjustment(currentPrice: number, percentage: number): number {
  return Math.round(currentPrice * (1 + percentage / 100));
}

/** Ajusta un precio existente +/- un monto fijo en pesos (queda en modo MANUAL). */
export function applyFixedAdjustment(currentPrice: number, amount: number): number {
  return Math.round(currentPrice + amount);
}
