"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { ProductRecord } from "@/lib/types";
import { ProductCatalog } from "@/components/shared/ProductCatalog";
import { filterAndSortProducts, getAvailableBrands, type CatalogSortOption } from "@/lib/catalog-search";

type SortOption = CatalogSortOption;

type CatalogExplorerProps = {
  products: ProductRecord[];
  quantities: Record<string, number>;
  onAdd: (productId: string) => void;
  onDecrease?: (productId: string) => void;
  onRemove?: (productId: string) => void;
};

const PAGE_SIZE = 12;

/** Catalogo completo con busqueda por nombre/marca/SKU, filtro por marca y orden. */
export function CatalogExplorer({ products, quantities, onAdd, onDecrease, onRemove }: CatalogExplorerProps) {
  const [query, setQuery] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [sort, setSort] = useState<SortOption>("nombre-asc");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const brands = useMemo(() => getAvailableBrands(products), [products]);

  const filtered = useMemo(
    () => filterAndSortProducts(products, { query, brand: brandFilter, sort }),
    [products, query, brandFilter, sort]
  );

  const visibleProducts = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98a2b3]" />
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setVisibleCount(PAGE_SIZE);
            }}
            placeholder="Buscar por nombre, marca o SKU"
            aria-label="Buscar en el catálogo"
            className="w-full rounded-xl border border-[#e4e7ec] bg-white py-2.5 pl-9 pr-3 text-sm text-[#111318] shadow-sm outline-none transition focus:border-[#7357ff] focus:ring-2 focus:ring-[#eeebff]"
          />
        </div>
        <select
          value={brandFilter}
          onChange={(event) => {
            setBrandFilter(event.target.value);
            setVisibleCount(PAGE_SIZE);
          }}
          aria-label="Filtrar por marca"
          className="rounded-xl border border-[#e4e7ec] bg-white px-3 py-2.5 text-sm text-[#111318] shadow-sm outline-none transition focus:border-[#7357ff] focus:ring-2 focus:ring-[#eeebff]"
        >
          <option value="">Todas las marcas</option>
          {brands.map((brand) => (
            <option key={brand} value={brand}>
              {brand}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value as SortOption)}
          aria-label="Ordenar catálogo"
          className="rounded-xl border border-[#e4e7ec] bg-white px-3 py-2.5 text-sm text-[#111318] shadow-sm outline-none transition focus:border-[#7357ff] focus:ring-2 focus:ring-[#eeebff]"
        >
          <option value="nombre-asc">Nombre (A-Z)</option>
          <option value="precio-asc">Precio (menor a mayor)</option>
          <option value="precio-desc">Precio (mayor a menor)</option>
        </select>
      </div>

      {filtered.length === 0 && products.length > 0 ? (
        <div className="flex min-h-40 flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-[#d0d5dd] bg-white px-5 py-8 text-center">
          <h4 className="text-base font-semibold text-[#111318]">Sin resultados</h4>
          <p className="max-w-md text-sm leading-6 text-[#667085]">
            No encontramos perfumes que coincidan con tu búsqueda. Prueba con otro nombre o marca.
          </p>
        </div>
      ) : (
        <>
          <ProductCatalog
            products={visibleProducts}
            quantities={quantities}
            onAdd={onAdd}
            onDecrease={onDecrease}
            onRemove={onRemove}
          />
          {hasMore ? (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                className="rounded-xl border border-[#e4e7ec] bg-white px-5 py-2.5 text-sm font-semibold text-[#5434e6] shadow-sm transition hover:border-[#7357ff] hover:bg-[#f7f5ff]"
              >
                Ver más productos
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
