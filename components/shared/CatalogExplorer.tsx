"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import type { ProductRecord } from "@/lib/types";
import { ProductFamilyCard } from "@/components/shared/ProductFamilyCard";
import {
  groupProductsIntoFamilies,
  getVisibleFamilies,
  filterAndSortFamilies,
  getAvailableFamilyBrands,
  type FamilySortOption
} from "@/lib/product-families";
import {
  CATALOG_INITIAL_VISIBLE_COUNT,
  hasMoreCatalogItems,
  isFirstCatalogExpansion,
  nextCatalogVisibleCount
} from "@/lib/catalog-pagination";

type SortOption = FamilySortOption;

type CatalogExplorerProps = {
  products: ProductRecord[];
  quantities: Record<string, number>;
  onAdd: (productId: string) => void;
  onDecrease?: (productId: string) => void;
  onRemove?: (productId: string) => void;
  /** Compatibilidad con el llamador (Top 15): no se usa visualmente aqui, el catalogo completo no repite el numero de ranking. */
  top12Keys?: ReadonlySet<string>;
};

const sortSelectClassName =
  "min-h-11 rounded-xl border border-[#DDD0C1] bg-white px-3 py-2 text-sm text-[#191714] shadow-sm outline-none transition focus:border-[#B88B58] focus:ring-2 focus:ring-[#F4E8DB]";

/**
 * Catalogo publico completo (Fase catalogo-completo): grid de tarjetas con
 * imagen (reutiliza ProductFamilyCard, el mismo componente del Top 15, en
 * modo `imageFit="contain"` para una tarjeta mas compacta), con buscador,
 * filtro de marca y orden. Vive INMEDIATAMENTE debajo de Top 15 + Ofertas en
 * OrderForm.tsx, reemplazando la version anterior en filas compactas sin
 * imagen. Nunca reimplementa reglas de negocio: agrupacion por familia,
 * visibilidad (activo/archivado/stock) y busqueda/orden vienen intactas de
 * lib/product-families.ts, las mismas que ya usan Top 15 y el buscador de
 * venta directa admin.
 */
export function CatalogExplorer({ products, quantities, onAdd, onDecrease, onRemove }: CatalogExplorerProps) {
  const [query, setQuery] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [sort, setSort] = useState<SortOption>("recomendados");
  const [visibleCount, setVisibleCount] = useState(CATALOG_INITIAL_VISIBLE_COUNT);

  const families = useMemo(() => getVisibleFamilies(groupProductsIntoFamilies(products)), [products]);
  const brands = useMemo(() => getAvailableFamilyBrands(families), [families]);

  const filtered = useMemo(
    () => filterAndSortFamilies(families, { query, brand: brandFilter, sort }),
    [families, query, brandFilter, sort]
  );

  const hasActiveFilters = query.trim() !== "" || brandFilter !== "" || sort !== "recomendados";

  const visibleFamilies = filtered.slice(0, visibleCount);
  const hasMore = hasMoreCatalogItems(filtered.length, visibleCount);
  const isFirstExpansion = isFirstCatalogExpansion(visibleCount);

  // Al cambiar busqueda/marca/orden se restablece la cantidad visible
  // (seccion 5 del encargo) para evitar estados extranos (ej. quedar con 42
  // visibles tras un filtro que solo devuelve 8 resultados). Se resetea en
  // cada handler de cambio (no en un efecto) para no encadenar renders.
  function handleQueryChange(value: string) {
    setQuery(value);
    setVisibleCount(CATALOG_INITIAL_VISIBLE_COUNT);
  }

  function handleBrandChange(value: string) {
    setBrandFilter(value);
    setVisibleCount(CATALOG_INITIAL_VISIBLE_COUNT);
  }

  function handleSortChange(value: SortOption) {
    setSort(value);
    setVisibleCount(CATALOG_INITIAL_VISIBLE_COUNT);
  }

  function clearFilters() {
    setQuery("");
    setBrandFilter("");
    setSort("recomendados");
    setVisibleCount(CATALOG_INITIAL_VISIBLE_COUNT);
  }

  if (families.length === 0) {
    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-[#191714]">Explora todo nuestro catálogo</h3>
          <p className="text-sm text-[#6B6258]">
            Encuentra tu próxima fragancia entre todas nuestras opciones disponibles.
          </p>
        </div>
        <div className="flex min-h-40 flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-[#d0d5dd] bg-white px-5 py-8 text-center">
          <h4 className="text-base font-semibold text-[#191714]">No hay perfumes disponibles por ahora</h4>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold text-[#191714]">Explora todo nuestro catálogo</h3>
        <p className="text-sm text-[#6B6258]">
          Encuentra tu próxima fragancia entre todas nuestras opciones disponibles.
        </p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#8C8175]" />
        <input
          type="search"
          value={query}
          onChange={(event) => handleQueryChange(event.target.value)}
          placeholder="Buscar perfume o marca..."
          aria-label="Buscar perfume o marca"
          className="w-full rounded-2xl border border-[#DDD0C1] bg-white py-3.5 pl-12 pr-11 text-base text-[#191714] shadow-sm outline-none transition focus:border-[#B88B58] focus:ring-2 focus:ring-[#F4E8DB]"
        />
        {query ? (
          <button
            type="button"
            onClick={() => handleQueryChange("")}
            aria-label="Limpiar búsqueda"
            className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-[#8C8175] hover:bg-[#EEE5DA] hover:text-[#4D453D]"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex flex-1 flex-col gap-1 text-xs font-semibold uppercase tracking-[0.1em] text-[#8C8175] sm:max-w-xs">
          Marca
          <select
            value={brandFilter}
            onChange={(event) => handleBrandChange(event.target.value)}
            aria-label="Filtrar por marca"
            className={sortSelectClassName}
          >
            <option value="">Todos</option>
            {brands.map((brand) => (
              <option key={brand} value={brand}>
                {brand}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-1 flex-col gap-1 text-xs font-semibold uppercase tracking-[0.1em] text-[#8C8175] sm:max-w-xs">
          Ordenar
          <select
            value={sort}
            onChange={(event) => handleSortChange(event.target.value as SortOption)}
            aria-label="Ordenar catálogo"
            className={sortSelectClassName}
          >
            <option value="recomendados">Recomendados</option>
            <option value="nombre-asc">Nombre A-Z</option>
            <option value="nombre-desc">Nombre Z-A</option>
            <option value="precio-asc">Precio: menor a mayor</option>
            <option value="precio-desc">Precio: mayor a menor</option>
          </select>
        </label>

        {hasActiveFilters ? (
          <button
            type="button"
            onClick={clearFilters}
            className="self-start text-sm font-semibold text-[#8A6036] hover:text-[#6F472C] sm:self-end"
          >
            Limpiar filtros
          </button>
        ) : null}
      </div>

      {hasActiveFilters ? (
        <p className="text-sm text-[#6B6258]" aria-live="polite">
          {filtered.length} {filtered.length === 1 ? "perfume encontrado" : "perfumes encontrados"}
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[#d0d5dd] bg-white px-5 py-8 text-center">
          <h4 className="text-base font-semibold text-[#191714]">No encontramos perfumes para tu búsqueda.</h4>
          <p className="max-w-md text-sm leading-6 text-[#6B6258]">Prueba buscando por nombre o marca.</p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-1 rounded-xl border border-[#DDD0C1] bg-white px-4 py-2 text-sm font-semibold text-[#8A6036] shadow-sm hover:border-[#B88B58]"
          >
            Limpiar búsqueda
          </button>
        </div>
      ) : (
        <>
          <div className="grid w-full max-w-full min-w-0 grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
            {visibleFamilies.map((family) => (
              <ProductFamilyCard
                key={family.key}
                family={family}
                imageFit="contain"
                quantities={quantities}
                onAdd={onAdd}
                onDecrease={onDecrease}
                onRemove={onRemove}
              />
            ))}
          </div>
          {hasMore ? (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => setVisibleCount(nextCatalogVisibleCount)}
                className="rounded-xl border border-[#DDD0C1] bg-white px-5 py-2.5 text-sm font-semibold text-[#8A6036] shadow-sm transition hover:border-[#B88B58] hover:bg-[#f7f5ff]"
              >
                {isFirstExpansion ? "Ver catálogo completo" : "Mostrar más"}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
