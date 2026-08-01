/**
 * Proyecto: Perfume Store
 * Modulo: Carrito de venta directa (Fase 3B.2)
 * Descripcion: Logica pura del carrito compacto de /admin/venta-directa.
 * Sin JSX ni estado de React para poder probarse sin jsdom. El total que
 * calcula este modulo es solo para mostrar en pantalla: la autoridad final
 * sobre precio y total es siempre el servidor (create_direct_sale_v1).
 */

import type { ProductFamily, ProductVariant } from "@/lib/product-families";

export type DirectSaleCartLine = {
  productId: string;
  nombre: string;
  marca: string;
  contenido: string;
  precioVenta: number;
  stockActual: number;
  cantidad: number;
  sku?: string;
};

function clampQuantity(quantity: number, stockActual: number): number {
  if (!Number.isFinite(quantity)) {
    return 0;
  }

  const normalized = Math.floor(quantity);

  if (normalized < 0) {
    return 0;
  }

  return Math.min(normalized, Math.max(0, Math.floor(stockActual)));
}

/**
 * Agrega una variante al carrito. Si ya existe una linea para la misma
 * variante, incrementa su cantidad en vez de crear una linea duplicada.
 * Nunca supera el stock disponible de la variante.
 */
export function addLine(
  lines: DirectSaleCartLine[],
  family: Pick<ProductFamily, "marca" | "nombre">,
  variant: ProductVariant,
  quantityToAdd = 1
): DirectSaleCartLine[] {
  const existing = lines.find((line) => line.productId === variant.productId);
  const requestedQuantity = Math.floor(quantityToAdd) || 0;

  if (requestedQuantity <= 0) {
    return lines;
  }

  const nextQuantity = clampQuantity(
    (existing?.cantidad ?? 0) + requestedQuantity,
    variant.stockActual
  );

  if (nextQuantity <= 0) {
    return lines;
  }

  if (existing) {
    return lines.map((line) =>
      line.productId === variant.productId ? { ...line, cantidad: nextQuantity } : line
    );
  }

  return [
    ...lines,
    {
      productId: variant.productId,
      nombre: family.nombre,
      marca: family.marca,
      contenido: variant.contenido,
      precioVenta: variant.precioVenta,
      stockActual: variant.stockActual,
      cantidad: nextQuantity,
      sku: variant.sku
    }
  ];
}

/**
 * Fija la cantidad de una linea existente. Un valor <= 0 quita la linea
 * (mismo comportamiento que "Quitar"). Nunca supera el stock de esa linea.
 */
export function updateQuantity(
  lines: DirectSaleCartLine[],
  productId: string,
  nextQuantity: number
): DirectSaleCartLine[] {
  const line = lines.find((item) => item.productId === productId);

  if (!line) {
    return lines;
  }

  const clamped = clampQuantity(nextQuantity, line.stockActual);

  if (clamped <= 0) {
    return lines.filter((item) => item.productId !== productId);
  }

  return lines.map((item) => (item.productId === productId ? { ...item, cantidad: clamped } : item));
}

export function removeLine(lines: DirectSaleCartLine[], productId: string): DirectSaleCartLine[] {
  return lines.filter((line) => line.productId !== productId);
}

/** Solo para mostrar en pantalla; el servidor recalcula el total real. */
export function computeTotal(lines: DirectSaleCartLine[]): number {
  return lines.reduce((sum, line) => sum + line.precioVenta * line.cantidad, 0);
}

export function computeTotalUnits(lines: DirectSaleCartLine[]): number {
  return lines.reduce((sum, line) => sum + line.cantidad, 0);
}
