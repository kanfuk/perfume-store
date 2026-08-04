/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Verificacion post-subida de imagen (lado cliente).
 * Descripcion: Funciones puras usadas por CatalogControlCenter para decidir
 * si una imagen realmente quedo visible antes de anunciar exito. Separadas
 * del componente para poder probarlas con datos reales, sin fetch ni DOM.
 */

export type ImageFieldsOnly = {
  imageStoragePath?: string | null;
  imageUrl?: string | null;
};

export type ExpectedImageFields = {
  imageStoragePath: string;
  imageUrl: string;
};

/**
 * True solo si `product` (tipicamente el resultado de una relectura GET
 * independiente, no el objeto que ya se tenia en memoria) trae EXACTAMENTE
 * la ruta y URL que se acaba de subir. Un producto ausente (null/undefined,
 * ej. porque la respuesta todavia no llego o una carrera de peticiones
 * devolvio datos de otro momento) nunca cuenta como verificado.
 */
export function productHasExpectedImage(
  product: ImageFieldsOnly | null | undefined,
  expected: ExpectedImageFields
): boolean {
  if (!product) return false;
  return product.imageStoragePath === expected.imageStoragePath && product.imageUrl === expected.imageUrl;
}

/** Busca por id dentro de una lista de productos (forma minima, reutilizable con cualquier registro que tenga `id`). */
export function findProductById<T extends { id: string }>(products: T[], id: string): T | null {
  return products.find((product) => product.id === id) ?? null;
}
