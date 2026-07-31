/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Normalizacion de metadatos - Fase 2B.13
 * Descripcion: Regla unica y compartida de "producto publicable": nombre,
 * marca, contenido y precio de venta validos. La usan tanto el servicio
 * publico (para excluir productos incompletos del storefront) como el
 * panel administrativo (para marcar "Ficha incompleta"). Nunca inventa
 * valores faltantes, solo detecta y describe que falta.
 */

export type CatalogCompletenessField = "nombre" | "marca" | "contenido" | "precio";

export type CatalogCompletenessCheck = {
  nombre?: string | null;
  marca?: string | null;
  contenido?: string | null;
  precioVenta?: number | null;
};

const FIELD_LABELS: Record<CatalogCompletenessField, string> = {
  nombre: "nombre",
  marca: "marca",
  contenido: "contenido",
  precio: "precio"
};

function isBlank(value: string | null | undefined): boolean {
  return !value || value.trim() === "";
}

/**
 * Campos requeridos para que un producto sea publicable/vendible que
 * faltan o son invalidos. Nunca evalua stock/activo/reservas (eso lo
 * decide getAvailableProductStock/product.activo por separado): esta
 * funcion es exclusivamente sobre metadatos e integridad de precio.
 */
export function getMissingCatalogFields(product: CatalogCompletenessCheck): CatalogCompletenessField[] {
  const missing: CatalogCompletenessField[] = [];
  if (isBlank(product.nombre)) missing.push("nombre");
  if (isBlank(product.marca)) missing.push("marca");
  if (isBlank(product.contenido)) missing.push("contenido");
  if (!(typeof product.precioVenta === "number" && Number.isFinite(product.precioVenta) && product.precioVenta > 0)) {
    missing.push("precio");
  }
  return missing;
}

/** Verdadero cuando el producto tiene todos los metadatos necesarios para publicarse. */
export function isProductMetadataComplete(product: CatalogCompletenessCheck): boolean {
  return getMissingCatalogFields(product).length === 0;
}

/** Texto corto y orientado a accion para el indicador administrativo ("Falta marca y contenido."). */
export function describeMissingCatalogFields(missing: CatalogCompletenessField[]): string {
  if (missing.length === 0) return "";
  const labels = missing.map((field) => FIELD_LABELS[field]);
  if (labels.length === 1) return `Falta ${labels[0]}.`;
  const last = labels[labels.length - 1];
  const rest = labels.slice(0, -1);
  return `Falta ${rest.join(", ")} y ${last}.`;
}
