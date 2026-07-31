/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Centro administrativo unificado - Fase 3A
 * Descripcion: Calculo puro de las metricas compactas de "Gestion de
 * catalogo" (resumen). No consulta Supabase ni conoce el repositorio: solo
 * recibe una lista ya cargada (services/productoService.ts la construye) y
 * cuenta. Reutilizado por el servicio (para la API liviana) y por las
 * pruebas (sin necesidad de un repositorio falso).
 */

import { TOP_PRODUCTS_LIMIT } from "./constants.ts";
import { getMissingCatalogFields, type CatalogCompletenessCheck } from "./catalog-completeness.ts";

export type CatalogSummaryProductInput = CatalogCompletenessCheck & {
  activo: boolean;
  stockActual: number;
  modoPrecio?: "AUTO" | "MANUAL";
  esTop?: boolean;
};

export type CatalogSummary = {
  total: number;
  activos: number;
  pausados: number;
  disponibles: number;
  sinStock: number;
  incompletos: number;
  preciosAuto: number;
  preciosManual: number;
  top12Asignados: number;
  top12Pendientes: number;
};

/**
 * Cuenta metricas operativas del catalogo completo. Nunca retorna listas ni
 * datos individuales de producto -- solo numeros, para que el resumen sea
 * liviano y no exponga mas de lo necesario.
 *
 * Definiciones (documentadas porque no son obvias):
 * - disponibles: activo Y con stock (lo que realmente se puede vender ahora).
 * - sinStock: stock <= 0, sin importar si esta activo o pausado (indica que
 *   necesita reposicion de todas formas).
 * - incompletos: getMissingCatalogFields > 0 (falta nombre/marca/contenido/
 *   precio valido); ver lib/catalog-completeness.ts.
 * - top12Pendientes: TOP_PRODUCTS_LIMIT - top12Asignados, nunca negativo.
 */
export function computeCatalogSummary(
  products: readonly CatalogSummaryProductInput[],
  top12Limit: number = TOP_PRODUCTS_LIMIT
): CatalogSummary {
  let activos = 0;
  let pausados = 0;
  let disponibles = 0;
  let sinStock = 0;
  let incompletos = 0;
  let preciosManual = 0;
  let top12Asignados = 0;

  for (const product of products) {
    if (product.activo) {
      activos += 1;
      if (product.stockActual > 0) disponibles += 1;
    } else {
      pausados += 1;
    }

    if (product.stockActual <= 0) sinStock += 1;
    if (getMissingCatalogFields(product).length > 0) incompletos += 1;
    if (product.modoPrecio === "MANUAL") preciosManual += 1;
    if (product.esTop) top12Asignados += 1;
  }

  return {
    total: products.length,
    activos,
    pausados,
    disponibles,
    sinStock,
    incompletos,
    preciosAuto: products.length - preciosManual,
    preciosManual,
    top12Asignados,
    top12Pendientes: Math.max(0, top12Limit - top12Asignados)
  };
}
