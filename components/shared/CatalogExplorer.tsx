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
  /** Claves de familia del Top (para el chip discreto "Top {TOP_PRODUCTS_LIMIT}" en la lista compacta). */
  top12Keys?: ReadonlySet<string>;
};

const PAGE_SIZE = 25;
/** Catalogo sin busqueda/marca/orden aplicado: solo 5 por defecto (Fase 2B.12), para no desplegar un muro completo apenas se abre la pagina. */
const DEFAULT_UNFILTERED_COUNT = 5;
/** Chips de marca visibles antes de "+N marcas" (mantiene el bloque ordenado incluso con muchas marcas). */
const INITIAL_BRAND_COUNT = 8;

function brandChipClass(active: boolean): string {
  return `flex h-9 w-full items-center justify-center truncate rounded-full border px-2.5 text-xs font-semibold transition ${
    active ? "border-[#7357ff] bg-[#eeebff] text-[#5434e6]" : "border-[#e4e7ec] bg-white text-[#667085] hover:border-[#c9bdff]"
  }`;
}

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
  const [showAllBrands, setShowAllBrands] = useState(false);

  const families = useMemo(() => getVisibleFamilies(groupProductsIntoFamilies(products)), [products]);
  const brands = useMemo(() => getAvailableFamilyBrands(families), [families]);

  // Marcas visibles: ordenadas A-Z (ya lo hace getAvailableFamilyBrands), acotadas a
  // INITIAL_BRAND_COUNT salvo que el usuario expanda o que la marca activa quede fuera
  // de ese recorte inicial (nunca se oculta la marca actualmente seleccionada).
  const visibleBrands = useMemo(() => {
    if (showAllBrands || brands.length <= INITIAL_BRAND_COUNT) return brands;
    const initial = brands.slice(0, INITIAL_BRAND_COUNT);
    if (brandFilter && !initial.includes(brandFilter)) {
      return [...initial, brandFilter].sort((a, b) => a.localeCompare(b));
    }
    return initial;
  }, [brands, brandFilter, showAllBrands]);
  const hiddenBrandCount = brands.length - visibleBrands.length;

  const filtered = useMemo(
    () => filterAndSortFamilies(families, { query, brand: brandFilter, sort }),
    [families, query, brandFilter, sort]
  );

  const hasActiveFilters = query.trim() !== "" || brandFilter !== "" || sort !== "recomendados";
  const isSearching = query.trim() !== "";
  // Sin busqueda/marca/orden aplicado, el listado dinamico queda acotado a
  // DEFAULT_UNFILTERED_COUNT (seccion C, Fase 2B.12): la paginacion progresiva
  // (25 + "Ver mas") solo se habilita una vez que el usuario busca, filtra por
  // marca u ordena, para no desplegar el catalogo completo apenas se abre la pagina.
  const effectiveVisibleCount = hasActiveFilters ? visibleCount : DEFAULT_UNFILTERED_COUNT;
  const visibleFamilies = filtered.slice(0, effectiveVisibleCount);
  const hasMore = hasActiveFilters && visibleCount < filtered.length;
  const hiddenByDefaultCount = !hasActiveFilters ? Math.max(0, filtered.length - DEFAULT_UNFILTERED_COUNT) : 0;

  function clearQuery() {
    setQuery("");
    setVisibleCount(PAGE_SIZE);
  }

  function clearFilters() {
    setQuery("");
    setBrandFilter("");
    setSort("recomendados");
    setVisibleCount(PAGE_SIZE);
    setShowAllBrands(false);
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

      <div className="space-y-3 rounded-2xl border border-[#e4e7ec] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#98a2b3]">
            Filtrar por marca
          </span>
          <div className="flex items-center gap-3">
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortOption)}
              aria-label="Ordenar catálogo"
              className="rounded-xl border border-[#e4e7ec] bg-white px-3 py-2 text-sm text-[#111318] shadow-sm outline-none transition focus:border-[#7357ff] focus:ring-2 focus:ring-[#eeebff]"
            >
              <option value="recomendados">Recomendados</option>
              <option value="nombre-asc">Nombre A-Z</option>
              <option value="precio-asc">Menor precio</option>
              <option value="precio-desc">Mayor precio</option>
            </select>
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={clearFilters}
                className="shrink-0 text-sm font-semibold text-[#5434e6] hover:text-[#392694]"
              >
                Limpiar filtros
              </button>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          <button
            type="button"
            onClick={() => {
              setBrandFilter("");
              setVisibleCount(PAGE_SIZE);
            }}
            className={brandChipClass(brandFilter === "")}
          >
            Todas las marcas
          </button>
          {visibleBrands.map((brand) => (
            <button
              key={brand}
              type="button"
              onClick={() => {
                setBrandFilter(brand);
                setVisibleCount(PAGE_SIZE);
                setShowAllBrands(false);
              }}
              className={brandChipClass(brandFilter === brand)}
              title={brand}
            >
              {brand}
            </button>
          ))}
          {brands.length > INITIAL_BRAND_COUNT ? (
            <button
              type="button"
              onClick={() => setShowAllBrands((current) => !current)}
              aria-expanded={showAllBrands}
              className="flex h-9 w-full items-center justify-center truncate rounded-full border border-dashed border-[#c9bdff] bg-[#faf9ff] px-2.5 text-xs font-semibold text-[#5434e6] transition hover:border-[#7357ff]"
            >
              {showAllBrands ? "Ver menos" : `+${hiddenBrandCount} marcas`}
            </button>
          ) : null}
        </div>
      </div>

      <p className="text-sm text-[#667085]" aria-live="polite">
        {isSearching
          ? `${filtered.length} ${filtered.length === 1 ? "perfume encontrado" : "perfumes encontrados"}`
          : hiddenByDefaultCount > 0
            ? `Mostrando ${DEFAULT_UNFILTERED_COUNT} de ${filtered.length} perfumes. Usa la búsqueda o los filtros para explorar el resto del catálogo.`
            : `${filtered.length} ${filtered.length === 1 ? "perfume" : "perfumes"}`}
      </p>

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
