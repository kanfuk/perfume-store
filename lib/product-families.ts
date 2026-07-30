/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Familias de producto (Fase 2B.8)
 * Descripcion: Agrupa visualmente variantes de un mismo perfume (misma marca
 * y mismo nombre comercial, distinto contenido) en una sola tarjeta publica
 * con selector de tamano. Es puramente comercial/visual: cada variante sigue
 * siendo un producto independiente en Supabase (id, sku, stock, precio,
 * imagen, Top 12 propios). Este modulo nunca fusiona, promedia ni combina
 * datos entre variantes.
 */

import { normalizeMatchKey, normalizeContenido } from "./catalog-import/normalization.ts";
import { getAvailableProductStock } from "./stock.ts";
import type { ProductRecord } from "./types.ts";

export type ProductVariant = {
  productId: string;
  sku?: string;
  contenido: string;
  precioVenta: number;
  precioAnterior?: number;
  stockActual: number;
  stockReservado?: number;
  disponible: boolean;
  activo: boolean;
  esTop: boolean;
  ordenDestacado?: number;
  imageUrl?: string;
};

export type ProductFamily = {
  key: string;
  marca: string;
  nombre: string;
  descripcion?: string;
  badgeLabel?: string;
  imageUrl?: string;
  variants: ProductVariant[];
};

/**
 * Clave de familia: marca + nombre normalizados (sin tildes, minusculas,
 * espacios unificados). NUNCA incluye el contenido. NO usa similitud difusa:
 * dos nombres distintos (ej. "Aqua di Gio Profondo" vs "Aqua di Gio Profondo
 * Parfum") producen familias distintas a proposito, porque los modificadores
 * de concentracion/formulacion (EDT, EDP, Parfum, Elixir, Intense, Absolu,
 * Royal, Rose, Homme, Femme, Men, Woman, Pour Homme, Pour Femme, ...) forman
 * parte de la identidad del nombre y ya vienen incluidos en `product.nombre`.
 */
export function buildFamilyKey(marca: string | undefined, nombre: string): string {
  return `${normalizeMatchKey(marca ?? "")}|${normalizeMatchKey(nombre)}`;
}

/** Extrae el valor numerico de un contenido normalizado ("50ML" -> 50); NaN si no aplica. */
function contentSortValue(contenido: string): number {
  const match = normalizeContenido(contenido).match(/^(\d+(?:\.\d+)?)/);
  return match ? Number.parseFloat(match[1]) : Number.POSITIVE_INFINITY;
}

function toVariant(product: ProductRecord): ProductVariant {
  const stockActual = product.stockActual ?? 0;
  const disponible = Boolean(product.activo) && getAvailableProductStock(product) > 0;

  return {
    productId: product.id,
    sku: product.sku,
    contenido: product.contenido ?? "",
    precioVenta: product.precioVenta,
    precioAnterior: product.precioAnterior,
    stockActual,
    stockReservado: product.stockReservado,
    disponible,
    activo: Boolean(product.activo),
    esTop: Boolean(product.esTop),
    ordenDestacado: product.ordenDestacado,
    imageUrl: product.imageUrl
  };
}

/**
 * Resuelve la imagen de la familia en orden: (1) imagen Top 12 explicita si
 * se provee, (2) primera image_url valida entre variantes disponibles,
 * (3) primera image_url valida entre cualquier variante, (4) undefined (deja
 * que el fallback visual existente de ProductImage se encargue).
 */
function resolveFamilyImage(variants: ProductVariant[], top12ImageUrl?: string): string | undefined {
  if (top12ImageUrl) return top12ImageUrl;

  const availableWithImage = variants.find((v) => v.disponible && v.imageUrl);
  if (availableWithImage?.imageUrl) return availableWithImage.imageUrl;

  const anyWithImage = variants.find((v) => v.imageUrl);
  return anyWithImage?.imageUrl;
}

export type GenericFamilyGroup<T> = {
  key: string;
  marca: string;
  nombre: string;
  items: T[];
};

/**
 * Agrupacion generica y puramente visual/informativa por clave de familia
 * (marca+nombre). Usada por el catalogo administrativo (Fase 2B.8, seccion
 * 10) y por el resumen final del asistente de calidad (seccion 11) para
 * mostrar "N presentaciones" sin fusionar ni modificar ningun dato. Preserva
 * el orden de primera aparicion.
 */
export function groupByFamilyKey<T extends { marca?: string; nombre: string }>(
  items: T[]
): GenericFamilyGroup<T>[] {
  const order: string[] = [];
  const groups = new Map<string, GenericFamilyGroup<T>>();

  for (const item of items) {
    const key = buildFamilyKey(item.marca, item.nombre);
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
    } else {
      groups.set(key, { key, marca: item.marca ?? "", nombre: item.nombre, items: [item] });
      order.push(key);
    }
  }

  return order.map((key) => groups.get(key)!);
}

/**
 * Agrupa una lista de productos en familias. Preserva el orden de primera
 * aparicion de cada familia. Cada variante se ordena por contenido numerico
 * ascendente (30ML, 50ML, 80ML, 100ML, 125ML, 200ML...); los valores no
 * numericos quedan al final, en el orden en que aparecieron.
 */
export function groupProductsIntoFamilies(products: ProductRecord[]): ProductFamily[] {
  const order: string[] = [];
  const families = new Map<
    string,
    { marca: string; nombre: string; descripcion?: string; badgeLabel?: string; products: ProductRecord[] }
  >();

  for (const product of products) {
    const key = buildFamilyKey(product.marca, product.nombre);
    const existing = families.get(key);
    if (existing) {
      existing.products.push(product);
    } else {
      families.set(key, {
        marca: product.marca ?? "",
        nombre: product.nombre,
        descripcion: product.descripcion,
        badgeLabel: product.badgeLabel,
        products: [product]
      });
      order.push(key);
    }
  }

  return order.map((key) => {
    const entry = families.get(key)!;
    const variants = entry.products
      .map(toVariant)
      .sort((a, b) => contentSortValue(a.contenido) - contentSortValue(b.contenido));

    return {
      key,
      marca: entry.marca,
      nombre: entry.nombre,
      descripcion: entry.descripcion,
      badgeLabel: entry.badgeLabel,
      imageUrl: resolveFamilyImage(variants),
      variants
    };
  });
}

export type TopFamilyEntry = {
  family: ProductFamily;
  rank: number;
  initialVariantId: string;
};

/**
 * Ranking Top 12 a nivel de FAMILIA: si dos variantes de la misma familia
 * estan vinculadas a posiciones distintas (es_top+orden_destacado), se
 * colapsan en UNA sola entrada usando la mejor posicion (numero menor) como
 * ranking mostrado; esa variante queda preseleccionada. Nunca fusiona datos:
 * solo decide que UNA tarjeta publica representa a la familia y cual de sus
 * variantes se muestra por defecto.
 */
export function getTopFamilies(families: ProductFamily[], limit: number): TopFamilyEntry[] {
  return families
    .map((family) => {
      const topVariants = family.variants.filter((v) => v.esTop && typeof v.ordenDestacado === "number");
      if (topVariants.length === 0) return null;

      const best = topVariants.reduce((min, current) =>
        (current.ordenDestacado as number) < (min.ordenDestacado as number) ? current : min
      );

      return { family, rank: best.ordenDestacado as number, initialVariantId: best.productId };
    })
    .filter((entry): entry is TopFamilyEntry => entry !== null)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit);
}

/** Familias con al menos una variante disponible (activa y con stock). Las demas no deben mostrarse en el catalogo publico. */
export function getVisibleFamilies(families: ProductFamily[]): ProductFamily[] {
  return families.filter((family) => family.variants.some((v) => v.disponible));
}

/** Variante seleccionada por defecto: disponible de menor contenido; si ninguna esta disponible, la primera. */
export function getDefaultVariant(family: ProductFamily): ProductVariant {
  return family.variants.find((v) => v.disponible) ?? family.variants[0];
}

/** Precio minimo entre variantes disponibles (o entre todas si ninguna esta disponible). Util para ordenar por "menor precio". */
export function getFamilyMinPrice(family: ProductFamily): number {
  const pool = family.variants.filter((v) => v.disponible);
  const source = pool.length > 0 ? pool : family.variants;
  return Math.min(...source.map((v) => v.precioVenta));
}

/** Precio maximo entre variantes disponibles (o entre todas si ninguna esta disponible). Util para ordenar por "mayor precio". */
export function getFamilyMaxPrice(family: ProductFamily): number {
  const pool = family.variants.filter((v) => v.disponible);
  const source = pool.length > 0 ? pool : family.variants;
  return Math.max(...source.map((v) => v.precioVenta));
}

/** Todo el texto buscable de una familia: nombre, marca y el contenido de cada variante. */
export function getFamilySearchHaystack(family: ProductFamily): string {
  return [family.nombre, family.marca, ...family.variants.map((v) => v.contenido), ...family.variants.map((v) => v.sku ?? "")]
    .join(" ");
}

// ---------------------------------------------------------------------------
// Busqueda, filtro y orden a nivel de familia (para el catalogo publico).
// No se reutiliza lib/catalog-search.ts a proposito: ese modulo es compartido
// con el catalogo administrativo (que sigue operando por producto, no por
// familia) y no debe modificarse para esta fase.
// ---------------------------------------------------------------------------

export type FamilySortOption = "recomendados" | "nombre-asc" | "precio-asc" | "precio-desc";

export type FamilyFilterOptions = {
  query?: string;
  brand?: string;
  sort?: FamilySortOption;
};

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function getAvailableFamilyBrands(families: ProductFamily[]): string[] {
  const set = new Set<string>();
  for (const family of families) {
    if (family.marca) set.add(family.marca);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/**
 * Filtra y ordena familias. La busqueda por texto encuentra una familia por
 * nombre, marca, o contenido/SKU de CUALQUIERA de sus variantes (ej. buscar
 * "80ML" puede mostrar una familia cuya variante de 80ML es la que matchea).
 * Orden por precio usa el minimo/maximo disponible de la familia, nunca el
 * precio de una variante fija.
 */
export function filterAndSortFamilies(
  families: ProductFamily[],
  { query = "", brand = "", sort = "nombre-asc" }: FamilyFilterOptions
): ProductFamily[] {
  const normalizedQuery = normalizeSearchText(query);

  let result = families.filter((family) => {
    if (brand && family.marca !== brand) return false;
    if (!normalizedQuery) return true;

    return normalizeSearchText(getFamilySearchHaystack(family)).includes(normalizedQuery);
  });

  result = [...result].sort((a, b) => {
    if (sort === "precio-asc") return getFamilyMinPrice(a) - getFamilyMinPrice(b);
    if (sort === "precio-desc") return getFamilyMaxPrice(b) - getFamilyMaxPrice(a);
    if (sort === "recomendados") return 0; // preserva el orden recibido (curado en el origen)
    return a.nombre.localeCompare(b.nombre);
  });

  return result;
}
