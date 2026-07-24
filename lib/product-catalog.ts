type ProductVisualMeta = {
  imageUrl: string;
  badgeLabel: string;
};

const DEFAULT_VISUAL: ProductVisualMeta = {
  imageUrl: "",
  badgeLabel: "PERFUME"
};

/**
 * Punto de extension para asociar imagenes/etiquetas fijas a productos por id
 * o nombre cuando el producto no trae su propio imageUrl/badgeLabel. Vacio a
 * proposito: el mapa heredado de Pauli Store (fotos de dobladitas/quequitos)
 * no aplica a un catalogo de perfumes y se elimino en la Fase 1B.
 */
const PRODUCT_VISUALS: Record<string, ProductVisualMeta> = {};

function normalizeProductKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getProductVisualMeta(product: { id?: string; nombre?: string }) {
  const keys = [product.id, product.nombre]
    .filter((value): value is string => Boolean(value))
    .map(normalizeProductKey);

  for (const key of keys) {
    const meta = PRODUCT_VISUALS[key];

    if (meta) {
      return meta;
    }
  }

  return DEFAULT_VISUAL;
}
