/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Centro administrativo unificado - Fase 3A
 * Descripcion: Construccion de rutas y deteccion de seccion activa para
 * "Gestion de catalogo" (/admin/catalogo/*). Funciones puras (sin React,
 * sin next/navigation) para poder probarlas sin jsdom: la navegacion real
 * (AdminCatalogNavigation.tsx) solo las llama con `usePathname()`.
 */

export type CatalogSection = "resumen" | "productos" | "stock" | "precios" | "top12";

export const CATALOG_SECTIONS: CatalogSection[] = ["resumen", "productos", "stock", "precios", "top12"];

export const CATALOG_SECTION_LABELS: Record<CatalogSection, string> = {
  resumen: "Resumen",
  productos: "Productos",
  stock: "Stock",
  precios: "Precios",
  top12: "Top 15"
};

const CATALOG_SECTION_PATHS: Record<CatalogSection, string> = {
  resumen: "/admin/catalogo",
  productos: "/admin/catalogo/productos",
  stock: "/admin/catalogo/stock",
  precios: "/admin/catalogo/precios",
  top12: "/admin/catalogo/top12"
};

/** Rutas antiguas que ahora redirigen a su equivalente dentro de /admin/catalogo. */
export const LEGACY_CATALOG_REDIRECTS: Record<string, CatalogSection> = {
  "/admin/stock": "stock",
  "/admin/precios": "precios",
  "/admin/top12": "top12"
};

/**
 * Construye el href de una seccion, preservando `q` (busqueda comun) y
 * cualquier otro parametro relevante (estado/marca/stock/modo/pagina) que se
 * pase explicitamente. Nunca incluye IDs seleccionados (seccion 10: la
 * seleccion nunca vive en la URL).
 */
export function buildCatalogSectionHref(
  section: CatalogSection,
  params?: Readonly<Record<string, string | undefined>>
): string {
  const base = CATALOG_SECTION_PATHS[section];
  if (!params) return base;

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, value);
  }

  const query = search.toString();
  return query ? `${base}?${query}` : base;
}

/** Determina la seccion activa a partir de un pathname (usePathname()). Null si no es una ruta de /admin/catalogo. */
export function resolveActiveCatalogSection(pathname: string): CatalogSection | null {
  const normalized = pathname.replace(/\/+$/, "") || "/";

  if (normalized === "/admin/catalogo") return "resumen";

  for (const section of CATALOG_SECTIONS) {
    if (section === "resumen") continue;
    if (normalized === CATALOG_SECTION_PATHS[section] || normalized.startsWith(`${CATALOG_SECTION_PATHS[section]}/`)) {
      return section;
    }
  }

  return null;
}

/**
 * Reescribe una ruta antigua (/admin/stock, /admin/precios, /admin/top12) a
 * su nueva ubicacion, preservando el querystring original (busqueda/filtros).
 * Retorna null si el pathname no es una de las rutas antiguas conocidas.
 */
export function resolveLegacyCatalogRedirect(pathname: string, search: string): string | null {
  const section = LEGACY_CATALOG_REDIRECTS[pathname];
  if (!section) return null;

  const target = CATALOG_SECTION_PATHS[section];
  return search ? `${target}${search}` : target;
}

/** Reconstruye un querystring ("?a=b&c=d" o "") a partir de `searchParams` tal como lo entrega page.tsx (Next.js). */
export function buildQueryStringFromParams(params: Readonly<Record<string, string | string[] | undefined>>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value !== "") {
      search.set(key, value);
    } else if (Array.isArray(value) && value[0]) {
      search.set(key, value[0]);
    }
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}
