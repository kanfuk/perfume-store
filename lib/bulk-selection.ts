/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Seleccion masiva para paneles admin (Fase 2B.9)
 * Descripcion: Funciones puras para manejar seleccion por productId real
 * (nunca por SKU, nombre o posicion) sobre listas grandes de productos.
 * Usado por Stock rapido para "seleccionar visibles/resultados/todo/limpiar"
 * sin depender de un entorno de render (testeable con environment: "node").
 */

/** Selecciona (union, no reemplaza) los ids indicados sobre la seleccion actual. */
export function selectIds(current: ReadonlySet<string>, ids: readonly string[]): Set<string> {
  const next = new Set(current);
  for (const id of ids) next.add(id);
  return next;
}

/** Vacia completamente la seleccion. */
export function clearSelection(): Set<string> {
  return new Set();
}

/** Alterna un id individual (checkbox de una tarjeta). */
export function toggleId(current: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** Cuantos de los ids seleccionados son visibles bajo el filtro/paginacion actual. */
export function countVisibleSelected(selected: ReadonlySet<string>, visibleIds: readonly string[]): number {
  return visibleIds.filter((id) => selected.has(id)).length;
}

/** Verdadero si la seleccion actual coincide exactamente con TODO el catalogo (sin filtros). */
export function isEntireCatalogSelected(selected: ReadonlySet<string>, allIds: readonly string[]): boolean {
  if (allIds.length === 0) return false;
  return allIds.length === selected.size && allIds.every((id) => selected.has(id));
}

/** IDs seleccionados que no son duplicados (Set ya lo garantiza, pero explicito para claridad/pruebas). */
export function toUniqueIdArray(selected: ReadonlySet<string>): string[] {
  return [...selected];
}
