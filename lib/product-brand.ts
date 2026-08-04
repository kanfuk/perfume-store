/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Marca - formulario manual de productos.
 * Descripcion: El modelo actual guarda la marca como texto libre en
 * `productos.marca` (no hay tabla de marcas separada, y esta fase no crea
 * una). Estas funciones puras derivan las sugerencias desde las marcas
 * distintas ya existentes en el catalogo y normalizan para que "Dior",
 * "DIOR" y " Dior " se traten como la misma marca. Reutiliza
 * `normalizeMatchKey`/`normalizeCasingSafe`, las mismas funciones que ya
 * usa el importador CSV para detectar `BRAND_INCONSISTENCY`.
 */

import { normalizeMatchKey } from "@/lib/catalog-import/normalization.ts";

export type BrandOption = {
  /** Clave normalizada para comparar/deduplicar (no se muestra). */
  key: string;
  /** Forma de display: la primera variante encontrada en el catalogo. */
  label: string;
};

/** Deriva las marcas distintas (por clave normalizada) desde una lista de marcas crudas del catalogo. */
export function buildBrandOptions(rawBrands: Array<string | null | undefined>): BrandOption[] {
  const byKey = new Map<string, string>();
  for (const raw of rawBrands) {
    const trimmed = (raw ?? "").trim();
    if (!trimmed) continue;
    const key = normalizeMatchKey(trimmed);
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, trimmed);
  }
  return Array.from(byKey.entries())
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "es"));
}

/**
 * Normaliza una marca escrita a mano para guardarla: SOLO recorta espacios
 * al borde y colapsa espacios internos repetidos. Deliberadamente NO cambia
 * mayusculas/minusculas -- una version anterior aplicaba title-case palabra
 * por palabra, lo que rompia marcas reales que se escriben con sigla o en
 * mayusculas (ej. "DKNY" -> "Dkny", "YSL" -> "Ysl", "BOSS" -> "Boss"). La
 * detección de duplicados/equivalencias (`findEquivalentBrand`) sigue
 * usando una CLAVE normalizada aparte para comparar sin importar mayusculas
 * ni espacios; esta funcion solo decide que TEXTO se guarda cuando la marca
 * es nueva, y ese texto debe ser exactamente lo que el admin escribio.
 */
export function normalizeBrandForSave(rawBrand: string): string {
  return rawBrand.trim().replace(/\s+/g, " ");
}

/** True si `candidate` ya existe (por clave normalizada) entre las marcas conocidas -- para avisar "ya existe" en vez de crear un duplicado equivalente. */
export function findEquivalentBrand(candidate: string, knownBrands: BrandOption[]): BrandOption | null {
  const key = normalizeMatchKey(candidate.trim());
  if (!key) return null;
  return knownBrands.find((brand) => brand.key === key) ?? null;
}
