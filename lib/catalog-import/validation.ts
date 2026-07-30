/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Catalog Import - Validacion de datos canonicos
 * Descripcion: Determina el estado de completitud de un producto candidato
 * (precio/stock) SIN inventar valores. Ausencia de dato != 0.
 */

import type { EstadoDatos } from "./types.ts";

export function computeEstadoDatos(precioVenta: number | null, stock: number | null): EstadoDatos {
  const faltaPrecio = precioVenta === null;
  const faltaStock = stock === null;

  if (faltaPrecio && faltaStock) return "FALTA_PRECIO|FALTA_STOCK";
  if (faltaPrecio) return "FALTA_PRECIO";
  if (faltaStock) return "FALTA_STOCK";
  return "COMPLETO";
}

export function isImportable(estadoDatos: EstadoDatos): boolean {
  return estadoDatos === "COMPLETO";
}

export function validatePrecioVenta(value: number | null): string | null {
  if (value !== null && value < 0) return "El precio de venta no puede ser negativo.";
  return null;
}

export function validateCostoUnitario(value: number | null): string | null {
  if (value !== null && value < 0) return "El costo unitario no puede ser negativo.";
  return null;
}

export function validateStock(value: number | null): string | null {
  if (value !== null && value < 0) return "El stock no puede ser negativo.";
  return null;
}
