/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Precio de venta sugerido - formulario manual de productos.
 * Descripcion: Envoltorio delgado sobre la UNICA formula de recargo ya
 * usada por el importador CSV (`calculateSalePrice`,
 * `lib/catalog-import/supplier-import.ts`): precioVenta = costo * (1 +
 * porcentaje/100), redondeado. No se crea una formula nueva. Aqui solo se
 * agrega la operacion inversa (precio -> porcentaje) que el importador no
 * necesita pero el formulario manual si, para que editar el precio final a
 * mano recalcule el margen mostrado.
 */

import { calculateSalePrice } from "@/lib/catalog-import/supplier-import.ts";

export const DEFAULT_MARKUP_PERCENTAGE = 35;

/** precioVenta = costo * (1 + porcentaje/100), redondeado (misma formula y redondeo que el importador). */
export function calculateSuggestedPrice(costoUnitario: number, markupPercentage: number): number {
  if (!Number.isFinite(costoUnitario) || !Number.isFinite(markupPercentage)) return 0;
  return calculateSalePrice(Math.max(0, costoUnitario), markupPercentage);
}

/**
 * Inversa: dado un costo y un precio de venta ya fijado a mano, calcula el
 * porcentaje de recargo equivalente (misma convencion: recargo sobre
 * costo, nunca margen bruto sobre venta). Devuelve 0 si el costo es 0 o
 * invalido (no hay porcentaje de recargo bien definido sobre costo cero).
 */
export function calculateMarkupPercentageFromPrice(costoUnitario: number, precioVenta: number): number {
  if (!Number.isFinite(costoUnitario) || !Number.isFinite(precioVenta) || costoUnitario <= 0) {
    return 0;
  }
  const percentage = (precioVenta / costoUnitario - 1) * 100;
  if (!Number.isFinite(percentage)) return 0;
  return Math.round(percentage * 100) / 100; // 2 decimales, evita ruido de punto flotante
}

/** Utilidad estimada (venta - costo), nunca negativa en la UI aunque el precio manual quede por debajo del costo. */
export function calculateEstimatedProfit(costoUnitario: number, precioVenta: number): number {
  if (!Number.isFinite(costoUnitario) || !Number.isFinite(precioVenta)) return 0;
  return precioVenta - costoUnitario;
}
