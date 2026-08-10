/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Paginacion progresiva del catalogo publico completo
 * Descripcion: Reglas puras de "cuantos productos mostrar" para la seccion
 * "Explora todo nuestro catalogo" (components/shared/CatalogExplorer.tsx).
 * Separado del componente para poder probarlo sin renderizar React.
 */

/** Vista inicial: 2 columnas x 3 filas en mobile. */
export const CATALOG_INITIAL_VISIBLE_COUNT = 6;
/** Cada expansion ("Ver catalogo completo" / "Mostrar mas") revela 12 productos adicionales. */
export const CATALOG_LOAD_MORE_STEP = 12;

export function hasMoreCatalogItems(totalCount: number, visibleCount: number): boolean {
  return visibleCount < totalCount;
}

export function nextCatalogVisibleCount(visibleCount: number): number {
  return visibleCount + CATALOG_LOAD_MORE_STEP;
}

/** true antes de la primera expansion (botón dice "Ver catálogo completo"), false despues ("Mostrar más"). */
export function isFirstCatalogExpansion(visibleCount: number): boolean {
  return visibleCount <= CATALOG_INITIAL_VISIBLE_COUNT;
}
