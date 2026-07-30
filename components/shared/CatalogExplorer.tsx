"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import type { ProductRecord } from "@/lib/types";
import { CompactFamilyCatalog } from "@/components/shared/CompactFamilyCatalog";
import {
  groupProductsIntoFamilies,
  getVisibleFamilies,
  filterAndSortFamilies,
  getAvailableFamilyBrands,
  type FamilySortOption
} from "@/lib/product-families";

type SortOption = FamilySortOption;

type CatalogExplorerProps = {
  products: ProductRecord[];
  quantities: Record<string, number>;
  onAdd: (productId: string) => void;
  onDecrease?: (productId: string) => void;
  onRemove?: (productId: string) => void;
  /** Claves de familia del Top 12 (para el chip discreto "Top 12" en la lista compacta). */
  top12Keys?: ReadonlySet<string>;
};

const PAGE_SIZE = 25;

/**
 * Directorio "Encuentra tu perfume" (Fase 2B.10): search-first, compacto y
 * sin fotografias grandes. Reemplaza la antigua grilla de tarjetas densas
 * (FamilyCatalog `dense`) por CompactFamilyCatalog para no renderizar cien
 * imagenes/fallbacks. El Top 12 sigue siendo la unica galeria visual.
 */
export function CatalogExplorer({ products, quantities, onAdd, onDecrease, onRemove, top12Keys }: CatalogExplorerProps) {
  const [query, setQuery] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [sort, setSort] = useState<SortOption>("recomendados");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const families = useMemo(() => getVisibleFamilies(groupProductsIntoFamilies(products)), [products]);
  const brands = useMemo(() => getAvailableFamilyBrands(families), [families]);

  const filtered = useMemo(
    () => filterAndSortFamilies(families, { query, brand: brandFilter, sort }),
    [families, query, brandFilter, sort]
  );

  const visibleFamilies = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;
  const hasActiveFilters = query.trim() !== "" || brandFilter !== "" || sort !== "recomendados";
  const isSearching = query.trim() !== "";

  function clearQuery() {
    setQuery("");
    setVisibleCount(PAGE_SIZE);
  }

  function clearFilters() {
    setQuery("");
    setBrandFilter("");
    setSort("recomendados");
    setVisibleCount(PAGE_SIZE);
  }

  if (families.length === 0) {
    return (
      <div className="flex min-h-40 flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-[#d0d5dd] bg-white px-5 py-8 text-center">
        <h4 className="text-base font-semibold text-[#111318]">No hay perfumes disponibles por ahora</h4>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold text-[#111318]">Encuentra tu perfume</h3>
        <p className="text-sm text-[#667085]">Busca por nombre, marca o tamaño.</p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#98a2b3]" />
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setVisibleCount(PAGE_SIZE);
          }}
          placeholder="Busca tu perfume o marca"
          aria-label="Buscar en el catálogo"
          className="w-full rounded-2xl border border-[#e4e7ec] bg-white py-3.5 pl-12 pr-11 text-base text-[#111318] shadow-sm outline-none transition focus:border-[#7357ff] focus:ring-2 focus:ring-[#eeebff]"
        />
        {isSearching ? (
          <button
            type="button"
            onClick={clearQuery}
            aria-label="Limpiar búsqueda"
            className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-[#98a2b3] hover:bg-[#f2f4f7] hover:text-[#344054]"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2 overflow-x-auto pb-1 sm:flex-1">
          <button
            type="button"
            onClick={() => {
              setBrandFilter("");
              setVisibleCount(PAGE_SIZE);
            }}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
              brandFilter === ""
                ? "border-[#7357ff] bg-[#eeebff] text-[#5434e6]"
                : "border-[#e4e7ec] bg-white text-[#667085]"
            }`}
          >
            Todas las marcas
          </button>
          {brands.map((brand) => (
            <button
              key={brand}
              type="button"
              onClick={() => {
                setBrandFilter(brand);
                setVisibleCount(PAGE_SIZE);
              }}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                brandFilter === brand
                  ? "border-[#7357ff] bg-[#eeebff] text-[#5434e6]"
                  : "border-[#e4e7ec] bg-white text-[#667085]"
              }`}
            >
              {brand}
            </button>
          ))}
        </div>
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value as SortOption)}
          aria-label="Ordenar catálogo"
          className="rounded-xl border border-[#e4e7ec] bg-white px-3 py-2.5 text-sm text-[#111318] shadow-sm outline-none transition focus:border-[#7357ff] focus:ring-2 focus:ring-[#eeebff]"
        >
          <option value="recomendados">Recomendados</option>
          <option value="nombre-asc">Nombre A-Z</option>
          <option value="precio-asc">Menor precio</option>
          <option value="precio-desc">Mayor precio</option>
        </select>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[#667085]" aria-live="polite">
          {isSearching
            ? `${filtered.length} ${filtered.length === 1 ? "perfume encontrado" : "perfumes encontrados"}`
            : `${filtered.length} ${filtered.length === 1 ? "perfume" : "perfumes"}`}
        </p>
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={clearFilters}
            className="text-sm font-semibold text-[#5434e6] hover:text-[#392694]"
          >
            Limpiar filtros
          </button>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[#d0d5dd] bg-white px-5 py-8 text-center">
          <h4 className="text-base font-semibold text-[#111318]">No encontramos ese perfume</h4>
          <p className="max-w-md text-sm leading-6 text-[#667085]">
            Prueba con otra marca, una parte del nombre o el tamaño.
          </p>
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-xl border border-[#e4e7ec] bg-white px-4 py-2 text-sm font-semibold text-[#5434e6] shadow-sm hover:border-[#7357ff]"
          >
            Limpiar búsqueda
          </button>
        </div>
      ) : (
        <>
          <CompactFamilyCatalog
            families={visibleFamilies}
            quantities={quantities}
            onAdd={onAdd}
            onDecrease={onDecrease}
            onRemove={onRemove}
            top12Keys={top12Keys}
          />
          {hasMore ? (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                className="rounded-xl border border-[#e4e7ec] bg-white px-5 py-2.5 text-sm font-semibold text-[#5434e6] shadow-sm transition hover:border-[#7357ff] hover:bg-[#f7f5ff]"
              >
                Ver {Math.min(PAGE_SIZE, filtered.length - visibleCount)} más
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
