/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Busqueda y filtros del catalogo publico
 * Descripcion: Logica pura (sin UI) de busqueda por nombre/marca/SKU, filtro
 * por marca y orden, usada por CatalogExplorer. Extraida a lib/ para poder
 * probarla sin un entorno DOM.
 */

import type { ProductRecord } from "@/lib/types";

export type CatalogSortOption = "recomendados" | "nombre-asc" | "precio-asc" | "precio-desc";

export type CatalogFilterOptions = {
  query?: string;
  brand?: string;
  sort?: CatalogSortOption;
};

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function getAvailableBrands(products: ProductRecord[]): string[] {
  const set = new Set<string>();
  for (const product of products) {
    if (product.marca) set.add(product.marca);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export function filterAndSortProducts(
  products: ProductRecord[],
  { query = "", brand = "", sort = "nombre-asc" }: CatalogFilterOptions
): ProductRecord[] {
  const normalizedQuery = normalizeSearchText(query);

  let result = products.filter((product) => {
    if (brand && product.marca !== brand) return false;
    if (!normalizedQuery) return true;

    const haystack = normalizeSearchText(
      [product.nombre, product.marca ?? "", product.sku ?? ""].join(" ")
    );
    return haystack.includes(normalizedQuery);
  });

  result = [...result].sort((a, b) => {
    if (sort === "precio-asc") return a.precioVenta - b.precioVenta;
    if (sort === "precio-desc") return b.precioVenta - a.precioVenta;
    if (sort === "recomendados") return 0; // preserva el orden recibido (curado en el origen)
    return a.nombre.localeCompare(b.nombre);
  });

  return result;
}
