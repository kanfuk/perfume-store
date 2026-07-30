/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Catalog Import - SKU determinista
 * Descripcion: Genera SKU legibles y estables a partir de marca+nombre+contenido,
 * sin timestamps ni UUID aleatorio. Formato: SML-<MARCA>-<NOMBRE>-<CONTENIDO>.
 * Ante colisiones (mismo SKU base para dos productos distintos) se agrega un
 * sufijo numerico estable (-2, -3, ...) basado en el orden de aparicion.
 */

import { normalizeContenido } from "./normalization.ts";

function toAsciiSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
}

export function buildSkuBase(marca: string, nombre: string, contenido: string): string {
  const marcaSlug = toAsciiSlug(marca) || "SINMARCA";
  const nombreSlug = toAsciiSlug(nombre) || "SINNOMBRE";
  const contenidoSlug = toAsciiSlug(normalizeContenido(contenido)) || "SINCONTENIDO";
  return `SML-${marcaSlug}-${nombreSlug}-${contenidoSlug}`;
}

/**
 * Asigna SKUs deterministas a una lista de productos (marca, nombre, contenido),
 * en el orden dado. Si dos entradas distintas producen el mismo SKU base
 * (colision), se agrega un sufijo "-2", "-3", etc. en orden de aparicion.
 */
export function assignDeterministicSkus<T>(
  items: T[],
  getFields: (item: T) => { marca: string; nombre: string; contenido: string }
): Map<T, string> {
  const result = new Map<T, string>();
  const counters = new Map<string, number>();

  for (const item of items) {
    const { marca, nombre, contenido } = getFields(item);
    const base = buildSkuBase(marca, nombre, contenido);
    const count = counters.get(base) ?? 0;
    counters.set(base, count + 1);
    const sku = count === 0 ? base : `${base}-${count + 1}`;
    result.set(item, sku);
  }

  return result;
}
