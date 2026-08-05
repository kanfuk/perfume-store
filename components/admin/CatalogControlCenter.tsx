"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  Home,
  ImageOff,
  Link2,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  UploadCloud
} from "lucide-react";
import Link from "next/link";
import { ProductImage } from "@/components/ProductImage";
import { AddPerfumeModal } from "@/components/admin/dashboard/AddPerfumeModal";
import { useAppFeedback } from "@/hooks/useAppFeedback";
import { formatCurrency } from "@/lib/format";
import { getAvailableBrands, filterAndSortProducts } from "@/lib/catalog-search";
import { groupByFamilyKey, type GenericFamilyGroup } from "@/lib/product-families";
import { getMissingCatalogFields, describeMissingCatalogFields } from "@/lib/catalog-completeness";
import { PRODUCT_IMAGE_CONFIG, isAcceptedProductImageMimeType } from "@/lib/product-image-config";
import { preloadImage } from "@/lib/preload-image";
import { findProductById, productHasExpectedImage } from "@/lib/product-image-verify";
import { getProductImageRenderConfig } from "@/lib/product-image-render";
import { TOP_PRODUCTS_LIMIT } from "@/lib/constants";
import type { AdminProductRecord } from "@/lib/types";

type ChipFilter =
  | "todos"
  | "activos"
  | "pausados"
  | "sin-stock"
  | "stock-bajo"
  | "top12"
  | "sin-imagen"
  | "ficha-incompleta";

function isFichaIncompleta(product: AdminProductRecord) {
  return getMissingCatalogFields(product).length > 0;
}

type AdminFamilyGroup = GenericFamilyGroup<AdminProductRecord>;

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Ocurrió un error.");
  return data;
}

function isStockBajo(product: AdminProductRecord) {
  return product.stockActual > 0 && product.stockActual <= (product.stockMinimo || 1);
}

/** Chips cuyo significado es una advertencia (reciben un detalle ambar sutil solo cuando estan activos). */
function isWarningChip(id: ChipFilter): boolean {
  return id === "sin-stock" || id === "stock-bajo" || id === "ficha-incompleta";
}

/** Mismo sistema visual sobrio para toda la grilla de filtros (chips y selector de marca comparten borde/radio/altura). */
function filterChipClass(active: boolean): string {
  return `flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border px-2.5 text-center text-xs font-semibold transition ${
    active
      ? "border-[#7357ff] bg-[#eeebff] text-[#5434e6]"
      : "border-[#e4e7ec] bg-white text-[#667085] hover:border-[#c9bdff]"
  }`;
}

/** Traduce el valor amigable de la URL (?estado=incompleto) al id interno del chip. */
function mapUrlEstadoToChipFilter(estado?: string): ChipFilter {
  switch (estado) {
    case "incompleto":
      return "ficha-incompleta";
    case "activos":
    case "pausados":
    case "sin-stock":
    case "stock-bajo":
    case "top12":
    case "sin-imagen":
    case "ficha-incompleta":
      return estado;
    default:
      return "todos";
  }
}

type CatalogControlCenterProps = {
  /**
   * True cuando se monta dentro del shell de /admin/catalogo (Fase 3A):
   * oculta el encabezado grande y los accesos directos que ya provee la
   * navegacion compartida, sin cambiar ninguna logica operativa.
   */
  embedded?: boolean;
  /** Termino de busqueda inicial (sincronizado con `?q=` del shell cuando embedded=true). */
  initialSearch?: string;
  /** Filtro inicial (valor amigable de `?estado=`, ver mapUrlEstadoToChipFilter). */
  initialFilter?: string;
};

export function CatalogControlCenter({ embedded = false, initialSearch = "", initialFilter }: CatalogControlCenterProps = {}) {
  const [products, setProducts] = useState<AdminProductRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState(initialSearch);
  const [brandFilter, setBrandFilter] = useState("");
  const [chip, setChip] = useState<ChipFilter>(() => mapUrlEstadoToChipFilter(initialFilter));
  const [editingImageId, setEditingImageId] = useState<string | null>(null);
  const [imageDraft, setImageDraft] = useState("");
  const [savingImage, setSavingImage] = useState(false);
  const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);

  // Guarda contra carreras de peticiones: `refreshCatalog` puede dispararse
  // desde la carga inicial Y desde "Agregar perfume" (onSaved). Si una
  // respuesta anterior llega DESPUES de una mas reciente, se descarta -- solo
  // la ultima peticion en salir puede escribir en `products`. `mountedRef`
  // evita ademas actualizar estado si el componente ya se desmonto.
  const refreshRequestIdRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Sincroniza `query` cuando `initialSearch` cambia (el buscador comun del
  // shell actualiza `?q=` sin desmontar esta pagina, ya que sigue siendo la
  // misma ruta). No es un simple "estado derivado de props": despues del
  // primer render, `query` tambien debe poder cambiar de forma independiente
  // si en algun momento se muestra el buscador propio (embedded=false).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuery(initialSearch);
  }, [initialSearch]);

  function toggleFamily(key: string) {
    setExpandedFamilies((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function refreshCatalog() {
    const requestId = ++refreshRequestIdRef.current;
    setLoading(true);
    setError("");
    try {
      const data = await fetchJson("/api/admin/products", { cache: "no-store" });
      if (!mountedRef.current || refreshRequestIdRef.current !== requestId) return;
      setProducts(data.products ?? []);
    } catch (err) {
      if (!mountedRef.current || refreshRequestIdRef.current !== requestId) return;
      setError(err instanceof Error ? err.message : "No fue posible cargar el catálogo.");
    } finally {
      if (mountedRef.current && refreshRequestIdRef.current === requestId) setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial deliberada, mismo patron que el resto del proyecto
    void refreshCatalog();
  }, []);

  const brands = useMemo(() => getAvailableBrands(products), [products]);

  const productTypeOptions = useMemo(
    () =>
      Array.from(
        new Set(["simple", ...products.map((product) => (product.tipoProducto || "simple").trim())].filter(Boolean))
      ).sort(),
    [products]
  );

  const indicators = useMemo(
    () => ({
      total: products.length,
      activos: products.filter((p) => p.activo).length,
      pausados: products.filter((p) => !p.activo).length,
      sinStock: products.filter((p) => p.stockActual <= 0).length,
      stockBajo: products.filter(isStockBajo).length,
      sinImagen: products.filter((p) => !p.imageUrl).length,
      fichaIncompleta: products.filter(isFichaIncompleta).length
    }),
    [products]
  );

  const chipFiltered = useMemo(() => {
    switch (chip) {
      case "activos":
        return products.filter((p) => p.activo);
      case "pausados":
        return products.filter((p) => !p.activo);
      case "sin-stock":
        return products.filter((p) => p.stockActual <= 0);
      case "stock-bajo":
        return products.filter(isStockBajo);
      case "top12":
        return products.filter((p) => p.esTop);
      case "sin-imagen":
        return products.filter((p) => !p.imageUrl);
      case "ficha-incompleta":
        return products.filter(isFichaIncompleta);
      default:
        return products;
    }
  }, [products, chip]);

  const filtered = useMemo(
    () => filterAndSortProducts(chipFiltered, { query, brand: brandFilter, sort: "nombre-asc" }) as AdminProductRecord[],
    [chipFiltered, query, brandFilter]
  );

  const familyGroups = useMemo(() => groupByFamilyKey(filtered), [filtered]);

  function startEditingImage(product: AdminProductRecord) {
    setEditingImageId(product.id);
    setImageDraft(product.imageUrl ?? "");
    setError("");
  }

  function cancelEditingImage() {
    setEditingImageId(null);
    setImageDraft("");
  }

  async function saveImage(product: AdminProductRecord) {
    setSavingImage(true);
    setError("");
    try {
      const data = await fetchJson(`/api/admin/products/${product.id}/image`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: imageDraft })
      });
      setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, imageUrl: data.imageUrl } : p)));
      cancelEditingImage();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible asignar la imagen.");
    } finally {
      setSavingImage(false);
    }
  }

  /** Aplica el resultado de Subir/Reemplazar/Eliminar (Fase 3B.3) a una sola fila, sin recargar el catalogo. */
  function handleProductImageChanged(productId: string, patch: Partial<AdminProductRecord>) {
    setProducts((prev) => prev.map((p) => (p.id === productId ? { ...p, ...patch } : p)));
  }

  const chips: Array<{ id: ChipFilter; label: string; count: number }> = [
    { id: "todos", label: "Todos", count: indicators.total },
    { id: "activos", label: "Activos", count: indicators.activos },
    { id: "pausados", label: "Pausados", count: indicators.pausados },
    { id: "sin-stock", label: "Sin stock", count: indicators.sinStock },
    { id: "stock-bajo", label: "Stock bajo", count: indicators.stockBajo },
    { id: "top12", label: `Top ${TOP_PRODUCTS_LIMIT}`, count: products.filter((p) => p.esTop).length },
    { id: "sin-imagen", label: "Sin imagen", count: indicators.sinImagen },
    { id: "ficha-incompleta", label: "Ficha incompleta", count: indicators.fichaIncompleta }
  ];

  // Filtros activos (chip + marca) y su limpieza (seccion 5, Fase 3A.1). Nunca
  // incluye `query`: la busqueda comun del shell es un concepto distinto y no
  // se toca aqui (no hay evidencia de que la implementacion actual la fusione).
  const hasActiveChipOrBrandFilter = chip !== "todos" || brandFilter !== "";
  const activeFilterLabels = [
    chip !== "todos" ? chips.find((option) => option.id === chip)?.label : undefined,
    brandFilter || undefined
  ].filter((label): label is string => Boolean(label));

  function clearChipAndBrandFilters() {
    setChip("todos");
    setBrandFilter("");
  }

  return (
    <main
      className={
        embedded
          ? "flex w-full min-w-0 max-w-full flex-col gap-6 overflow-x-hidden"
          : "mx-auto flex min-h-[100dvh] w-full max-w-[1400px] flex-col gap-6 overflow-x-hidden bg-[#f7f8fa] px-4 py-4 pb-[calc(88px+env(safe-area-inset-bottom))] sm:px-6 lg:px-8"
      }
    >
      {!embedded ? (
        <section className="overflow-hidden rounded-2xl bg-[#17191f] text-white shadow-[0_16px_36px_rgba(17,19,24,0.16)]">
          <div className="bg-[radial-gradient(circle_at_80%_20%,rgba(115,87,255,0.34),transparent_28%)] p-6 sm:p-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-2">
                <span className="inline-flex w-fit items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#c8c0ff]">
                  <Sparkles className="h-3.5 w-3.5" />
                  Admin Smellme.cl
                </span>
                <h1 className="text-3xl font-bold tracking-[-0.04em] text-white sm:text-4xl">Catálogo</h1>
                <p className="max-w-2xl text-sm leading-6 text-white/60 sm:text-base">
                  Centro de control: mira el estado general del catálogo y salta directo a la tarea que
                  necesitas.
                </p>
              </div>
              <Link
                href="/admin"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-center text-sm font-semibold text-white"
              >
                <Home className="h-4 w-4" />
                <span className="hidden sm:inline">Inicio</span>
              </Link>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                href="/admin/importar-catalogo"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white"
              >
                <UploadCloud className="h-4 w-4" />
                Importar CSV
              </Link>
              <Link
                href="/admin/catalogo/stock"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white"
              >
                <Boxes className="h-4 w-4" />
                Stock rápido
              </Link>
              <Link
                href="/admin/catalogo/precios"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white"
              >
                <CircleDollarSign className="h-4 w-4" />
                Precios
              </Link>
              <Link
                href="/admin/catalogo/top12"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white"
              >
                <Sparkles className="h-4 w-4" />
                Top {TOP_PRODUCTS_LIMIT}
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      {embedded ? (
        <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#111318]">Centro de productos</h2>
            <p className="text-sm text-[#667085]">Crea, revisa y ajusta cada perfume del catálogo.</p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#5434e6] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#4327c4] sm:w-auto"
          >
            <Plus className="h-4 w-4" />
            Agregar perfume
          </button>
        </section>
      ) : null}

      {error ? (
        <div className="flex items-start gap-2 rounded-xl border border-[#f3c6c0] bg-[#fdf1ef] px-4 py-3 text-sm text-[#8a2c22]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <IndicatorTile label="Total" value={indicators.total} />
        <IndicatorTile label="Activos" value={indicators.activos} tone="good" />
        <IndicatorTile label="Pausados" value={indicators.pausados} tone="neutral" />
        <IndicatorTile label="Sin stock" value={indicators.sinStock} tone="bad" />
        <IndicatorTile label="Stock bajo" value={indicators.stockBajo} tone="warn" />
        <IndicatorTile label="Sin imagen" value={indicators.sinImagen} tone="neutral" icon={<ImageOff className="h-3.5 w-3.5" />} />
        <IndicatorTile label="Ficha incompleta" value={indicators.fichaIncompleta} tone="warn" />
      </section>

      <section className="space-y-4 rounded-2xl border border-[#e4e7ec] bg-white p-5 shadow-sm sm:p-6">
        {/* Fase 3A.1: grilla controlada (2/3/4 columnas) en vez de wrap libre -- */}
        {/* cada chip ocupa el ancho completo de su celda, misma altura, texto centrado. */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {chips.map((chipOption) => {
            const active = chip === chipOption.id;
            return (
              <button
                key={chipOption.id}
                type="button"
                onClick={() => setChip(chipOption.id)}
                aria-pressed={active}
                className={filterChipClass(active)}
              >
                {isWarningChip(chipOption.id) && active ? (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#e3a008]" aria-hidden="true" />
                ) : null}
                <span className="truncate">{chipOption.label}</span>
                <span className="shrink-0 opacity-70">({chipOption.count})</span>
              </button>
            );
          })}
        </div>

        {!embedded ? (
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre, marca o SKU"
            aria-label="Buscar productos"
            className="w-full rounded-xl border border-[#e4e7ec] bg-white px-3 py-2.5 text-sm text-[#344054]"
          />
        ) : null}

        {/* Selector de marca integrado al mismo contenedor y sistema visual que los chips (seccion 4). */}
        <div className="space-y-1.5">
          <label htmlFor="catalog-brand-filter" className="text-xs font-semibold uppercase tracking-wide text-[#98a2b3]">
            Marca
          </label>
          <select
            id="catalog-brand-filter"
            value={brandFilter}
            onChange={(event) => setBrandFilter(event.target.value)}
            className="h-11 w-full rounded-xl border border-[#e4e7ec] bg-white px-3 text-sm font-medium text-[#344054]"
          >
            <option value="">Todas las marcas</option>
            {brands.map((brand) => (
              <option key={brand} value={brand}>
                {brand}
              </option>
            ))}
          </select>
        </div>

        {/* Filtros activos y limpieza (seccion 5): solo estado local de chip/marca -- */}
        {/* nunca toca `query`/`q`, que es la busqueda comun del shell y sigue distinta. */}
        {hasActiveChipOrBrandFilter ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#f7f8fa] px-3 py-2 text-xs">
            {activeFilterLabels.length > 1 ? (
              <span className="text-[#667085]">
                Filtros activos: <span className="font-semibold text-[#344054]">{activeFilterLabels.join(" · ")}</span>
              </span>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={clearChipAndBrandFilters}
              className="shrink-0 text-xs font-semibold text-[#5434e6] hover:text-[#392694]"
            >
              Limpiar filtros
            </button>
          </div>
        ) : null}

        <p className="text-sm text-[#667085]">{filtered.length} producto(s)</p>

        {loading ? (
          <p className="text-sm text-[#667085]">Cargando catálogo...</p>
        ) : (
          <>
            <div className="hidden overflow-x-auto rounded-xl border border-[#e4e7ec] md:block">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-[#f7f8fa] text-xs font-semibold uppercase tracking-wide text-[#667085]">
                  <tr>
                    <th className="px-4 py-3">Nombre</th>
                    <th className="px-4 py-3">Marca</th>
                    <th className="px-4 py-3">Precio</th>
                    <th className="px-4 py-3">Stock</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Top {TOP_PRODUCTS_LIMIT}</th>
                    <th className="px-4 py-3">Imagen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eef0f3]">
                  {familyGroups.map((group) =>
                    group.items.length > 1 ? (
                      <FamilyGroupRows
                        key={group.key}
                        group={group}
                        expanded={expandedFamilies.has(group.key)}
                        onToggle={() => toggleFamily(group.key)}
                        editingImageId={editingImageId}
                        imageDraft={imageDraft}
                        savingImage={savingImage}
                        onStartEditingImage={startEditingImage}
                        onCancelEditingImage={cancelEditingImage}
                        onImageDraftChange={setImageDraft}
                        onSaveImage={saveImage}
                        onProductImageChanged={handleProductImageChanged}
                      />
                    ) : (
                      <AdminProductRow
                        key={group.items[0].id}
                        product={group.items[0]}
                        editingImageId={editingImageId}
                        imageDraft={imageDraft}
                        savingImage={savingImage}
                        onStartEditingImage={startEditingImage}
                        onCancelEditingImage={cancelEditingImage}
                        onImageDraftChange={setImageDraft}
                        onSaveImage={saveImage}
                        onProductImageChanged={handleProductImageChanged}
                      />
                    )
                  )}
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-sm text-[#667085]">
                        {indicators.total === 0 ? (
                          <EmptyCatalogMessage onAddPerfume={() => setShowAddModal(true)} />
                        ) : (
                          <>
                            <p>Sin productos que coincidan con la búsqueda.</p>
                            {hasActiveChipOrBrandFilter ? (
                              <button
                                type="button"
                                onClick={clearChipAndBrandFilters}
                                className="mt-2 text-xs font-semibold text-[#5434e6] hover:text-[#392694]"
                              >
                                Limpiar filtros
                              </button>
                            ) : null}
                          </>
                        )}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 md:hidden">
              {familyGroups.map((group) =>
                group.items.length > 1 ? (
                  <FamilyGroupMobileCard
                    key={group.key}
                    group={group}
                    expanded={expandedFamilies.has(group.key)}
                    onToggle={() => toggleFamily(group.key)}
                    editingImageId={editingImageId}
                    imageDraft={imageDraft}
                    savingImage={savingImage}
                    onStartEditingImage={startEditingImage}
                    onCancelEditingImage={cancelEditingImage}
                    onImageDraftChange={setImageDraft}
                    onSaveImage={saveImage}
                    onProductImageChanged={handleProductImageChanged}
                  />
                ) : (
                  <AdminProductMobileCard
                    key={group.items[0].id}
                    product={group.items[0]}
                    editingImageId={editingImageId}
                    imageDraft={imageDraft}
                    savingImage={savingImage}
                    onStartEditingImage={startEditingImage}
                    onCancelEditingImage={cancelEditingImage}
                    onImageDraftChange={setImageDraft}
                    onSaveImage={saveImage}
                    onProductImageChanged={handleProductImageChanged}
                  />
                )
              )}
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-[#667085]">
                  {indicators.total === 0 ? (
                    <EmptyCatalogMessage onAddPerfume={() => setShowAddModal(true)} />
                  ) : (
                    <>
                      <p>Sin productos que coincidan con la búsqueda.</p>
                      {hasActiveChipOrBrandFilter ? (
                        <button
                          type="button"
                          onClick={clearChipAndBrandFilters}
                          className="text-xs font-semibold text-[#5434e6] hover:text-[#392694]"
                        >
                          Limpiar filtros
                        </button>
                      ) : null}
                    </>
                  )}
                </div>
              ) : null}
            </div>
          </>
        )}
      </section>

      {showAddModal ? (
        <AddPerfumeModal
          existingBrands={products.map((product) => product.marca ?? "")}
          existingTypes={productTypeOptions}
          onClose={() => setShowAddModal(false)}
          onSaved={() => void refreshCatalog()}
        />
      ) : null}
    </main>
  );
}

type ImageEditorProps = {
  editingImageId: string | null;
  imageDraft: string;
  savingImage: boolean;
  onStartEditingImage: (product: AdminProductRecord) => void;
  onCancelEditingImage: () => void;
  onImageDraftChange: (value: string) => void;
  onSaveImage: (product: AdminProductRecord) => void;
  onProductImageChanged: (productId: string, patch: Partial<AdminProductRecord>) => void;
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ACCEPTED_IMAGE_INPUT = PRODUCT_IMAGE_CONFIG.acceptedMimeTypes.join(",");

/**
 * Celda de imagen de Catalogo -> Productos (Fase 3B.3). Subir/Reemplazar
 * abren el selector de archivos, muestran preview local, y solo al
 * confirmar ("Procesar y guardar") suben el archivo -- el servidor procesa
 * y decide todo (bucket, path, formato, dimensiones). La URL manual queda
 * como "Opciones avanzadas" secundaria, reutilizando el flujo PATCH
 * existente sin cambios. El estado de carga/errores es por fila: cada
 * instancia de este componente (una por producto) tiene su propio estado.
 */
function ImageCellEditor({
  product,
  editingImageId,
  imageDraft,
  savingImage,
  onStartEditingImage,
  onCancelEditingImage,
  onImageDraftChange,
  onSaveImage,
  onProductImageChanged
}: ImageEditorProps & { product: AdminProductRecord }) {
  const feedback = useAppFeedback();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [visualCheckFailed, setVisualCheckFailed] = useState(false);
  const [localError, setLocalError] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  /** Datos de la ultima subida exitosa en el backend, pendientes de verificacion visual (ver verifyAndFinish). */
  const pendingVerificationRef = useRef<{ product: AdminProductRecord; imageStoragePath: string; imageUrl: string; successMessage: string } | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function openFilePicker() {
    setLocalError("");
    fileInputRef.current?.click();
  }

  function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!isAcceptedProductImageMimeType(file.type)) {
      setLocalError("Selecciona una imagen JPG, PNG, WebP o AVIF.");
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setLocalError("");
  }

  function cancelSelection() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl("");
    setLocalError("");
    setVisualCheckFailed(false);
    pendingVerificationRef.current = null;
  }

  /**
   * Verificacion real en el navegador ANTES de anunciar exito (no basta con
   * que el POST no haya lanzado una excepcion, ya vimos que eso no garantiza
   * que la imagen se pueda visualizar): 1) GET fresco de /api/admin/products
   * (cache: "no-store") para confirmar que la relectura del servidor YA ve
   * imageStoragePath/imageUrl nuevos; 2) precarga real de imageUrl con
   * window.Image() y espera su onload real. Solo si ambos pasan se
   * reemplaza el producto local y se cierra el editor -- si cualquiera
   * falla, el archivo seleccionado y el editor se mantienen, y se ofrece
   * "Reintentar visualización" sin volver a subir el archivo.
   */
  async function verifyAndFinish(pending: {
    product: AdminProductRecord;
    imageStoragePath: string;
    imageUrl: string;
    successMessage: string;
  }) {
    setVerifying(true);
    setVisualCheckFailed(false);
    setLocalError("");
    try {
      const data = await fetchJson("/api/admin/products", { cache: "no-store" });
      const latest = findProductById<AdminProductRecord>(data.products ?? [], pending.product.id);

      if (!productHasExpectedImage(latest, { imageStoragePath: pending.imageStoragePath, imageUrl: pending.imageUrl })) {
        pendingVerificationRef.current = pending;
        setVisualCheckFailed(true);
        setLocalError("La imagen se guardó, pero todavía no puede visualizarse.");
        return;
      }

      // Mismo src que renderizara ProductImage (ver getProductImageRenderConfig):
      // nunca se verifica una URL y se renderiza otra distinta.
      const loaded = await preloadImage(getProductImageRenderConfig(pending.imageUrl).src);
      if (!loaded) {
        pendingVerificationRef.current = pending;
        setVisualCheckFailed(true);
        setLocalError("La imagen se guardó, pero todavía no puede visualizarse.");
        return;
      }

      onProductImageChanged(pending.product.id, latest ?? pending.product);
      pendingVerificationRef.current = null;
      cancelSelection();
      feedback.success(pending.successMessage);
    } catch (err) {
      pendingVerificationRef.current = pending;
      setVisualCheckFailed(true);
      setLocalError(err instanceof Error ? err.message : "La imagen se guardó, pero todavía no puede visualizarse.");
    } finally {
      setVerifying(false);
    }
  }

  function retryVisualCheck() {
    if (!pendingVerificationRef.current || verifying) return;
    void verifyAndFinish(pendingVerificationRef.current);
  }

  async function confirmUpload() {
    if (!selectedFile || uploading) return;
    setUploading(true);
    setLocalError("");
    setVisualCheckFailed(false);
    const isReplace = Boolean(product.imageUrl);
    let uploadResult: { product: AdminProductRecord; imageStoragePath: string; imageUrl: string } | null = null;

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      const data = await fetchJson(`/api/admin/products/${product.id}/image`, {
        method: "POST",
        body: formData
      });
      // El endpoint devuelve el PRODUCTO COMPLETO releido de forma
      // independiente tras la verificacion post-escritura del backend -- eso
      // confirma persistencia en DB/Storage, pero no que el navegador ya
      // pueda cargar la URL (ver verifyAndFinish).
      if (!data.product || !data.imageStoragePath || !data.imageUrl) {
        throw new Error("La imagen se guardó pero no se pudo confirmar el producto actualizado. Recarga la página.");
      }
      uploadResult = { product: data.product, imageStoragePath: data.imageStoragePath, imageUrl: data.imageUrl };
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "No fue posible guardar la imagen.");
    } finally {
      setUploading(false);
    }

    if (uploadResult) {
      await verifyAndFinish({
        ...uploadResult,
        successMessage: isReplace ? "Imagen reemplazada correctamente." : "Imagen guardada correctamente."
      });
    }
  }

  async function confirmDelete() {
    const confirmed = await feedback.confirm({
      title: "¿Eliminar la imagen de este producto?",
      description: `El producto quedará visible sin imagen. Esta acción no modifica su precio, stock ni posición en Top ${TOP_PRODUCTS_LIMIT}.`,
      confirmLabel: "Eliminar imagen",
      cancelLabel: "Cancelar",
      tone: "danger"
    });
    if (!confirmed) return;

    setUploading(true);
    setLocalError("");
    try {
      const data = await fetchJson(`/api/admin/products/${product.id}/image`, { method: "DELETE" });
      onProductImageChanged(product.id, data.product ?? { imageUrl: "", imageStoragePath: "" });
      feedback.success("Imagen eliminada correctamente.");
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "No fue posible eliminar la imagen.");
    } finally {
      setUploading(false);
    }
  }

  const advancedPanel =
    editingImageId === product.id ? (
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <input
          type="text"
          value={imageDraft}
          onChange={(event) => onImageDraftChange(event.target.value)}
          placeholder="https://... o /images/..."
          className="w-48 min-h-9 rounded-lg border border-[#e4e7ec] px-2 py-1 text-xs"
        />
        <button
          type="button"
          onClick={() => onSaveImage(product)}
          disabled={savingImage}
          className="min-h-9 rounded-lg bg-[#5434e6] px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
        >
          Guardar
        </button>
        <button
          type="button"
          onClick={onCancelEditingImage}
          className="min-h-9 rounded-lg border border-[#e4e7ec] px-2 py-1 text-xs font-semibold text-[#344054]"
        >
          Cancelar
        </button>
      </div>
    ) : (
      <button
        type="button"
        onClick={() => {
          setAdvancedOpen(false);
          onStartEditingImage(product);
        }}
        className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-[#98a2b3] hover:text-[#667085]"
      >
        <Link2 className="h-3 w-3" />
        Usar dirección de imagen
      </button>
    );

  const advancedToggle =
    editingImageId === product.id ? null : (
      <button
        type="button"
        onClick={() => setAdvancedOpen((current) => !current)}
        className="mt-1 text-[11px] font-medium text-[#98a2b3] underline-offset-2 hover:text-[#667085] hover:underline"
      >
        Opciones avanzadas
      </button>
    );

  return (
    <div className="min-w-[9rem]">
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_IMAGE_INPUT}
        onChange={handleFileSelected}
        className="hidden"
      />

      {selectedFile ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-[#e4e7ec] bg-[#f7f8fa]">
              <ProductImage
                src={previewUrl}
                alt={product.nombre}
                sizes="44px"
                className="object-contain"
              />
            </div>
            <div className="min-w-0 text-[11px] text-[#667085]">
              <p className="truncate font-medium text-[#111318]">{selectedFile.name}</p>
              <p>{formatFileSize(selectedFile.size)}</p>
            </div>
          </div>
          <p className="text-[11px] text-[#98a2b3]">
            La imagen se ajustará automáticamente al formato del catálogo.
          </p>
          {verifying ? <p className="text-[11px] font-medium text-[#5434e6]">Verificando imagen…</p> : null}
          {localError ? <p className="text-[11px] font-medium text-[#b3261e]">{localError}</p> : null}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={confirmUpload}
              disabled={uploading || verifying}
              className="min-h-9 rounded-lg bg-[#5434e6] px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
            >
              {uploading ? "Procesando imagen…" : verifying ? "Verificando imagen…" : "Procesar y guardar"}
            </button>
            {visualCheckFailed ? (
              <button
                type="button"
                onClick={retryVisualCheck}
                disabled={verifying}
                className="min-h-9 rounded-lg border border-[#5434e6] px-2 py-1 text-xs font-semibold text-[#5434e6] disabled:opacity-50"
              >
                {verifying ? "Verificando…" : "Reintentar visualización"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={cancelSelection}
              disabled={uploading || verifying}
              className="min-h-9 rounded-lg border border-[#e4e7ec] px-2 py-1 text-xs font-semibold text-[#344054] disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : product.imageUrl ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-[#e4e7ec] bg-[#f7f8fa]">
              <ProductImage
                src={product.imageUrl}
                alt={product.nombre}
                sizes="44px"
                className="object-contain"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={openFilePicker}
                disabled={uploading}
                className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-[#e4e7ec] px-2 py-1 text-xs font-semibold text-[#344054] disabled:opacity-50"
              >
                <RefreshCw className="h-3 w-3" />
                Reemplazar
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={uploading}
                className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-[#e4e7ec] px-2 py-1 text-xs font-semibold text-[#b3261e] disabled:opacity-50"
              >
                <Trash2 className="h-3 w-3" />
                Eliminar
              </button>
            </div>
          </div>
          {uploading ? <p className="text-[11px] text-[#98a2b3]">Procesando imagen…</p> : null}
          {localError ? <p className="text-[11px] font-medium text-[#b3261e]">{localError}</p> : null}
          {advancedToggle}
          {advancedOpen ? advancedPanel : null}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={openFilePicker}
            disabled={uploading}
            className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-[#e4e7ec] px-2 py-1 text-xs font-semibold text-[#5434e6] disabled:opacity-50"
          >
            <UploadCloud className="h-3.5 w-3.5" />
            Subir imagen
          </button>
          {localError ? <p className="text-[11px] font-medium text-[#b3261e]">{localError}</p> : null}
          {advancedToggle}
          {advancedOpen ? advancedPanel : null}
        </div>
      )}
    </div>
  );
}

function AdminProductRow({ product, ...imageProps }: ImageEditorProps & { product: AdminProductRecord }) {
  return (
    <tr>
      <td className="px-4 py-2.5 text-[#111318]">{product.nombre}</td>
      <td className="px-4 py-2.5 text-[#667085]">{product.marca}</td>
      <td className="px-4 py-2.5 text-[#111318]">{formatCurrency(product.precioVenta)}</td>
      <td className="px-4 py-2.5 text-[#667085]">{product.stockActual}</td>
      <td className="px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <EstadoBadge product={product} />
          <IncompleteBadge product={product} />
        </div>
      </td>
      <td className="px-4 py-2.5 text-[#667085]">{product.esTop ? `#${product.ordenDestacado}` : "—"}</td>
      <td className="px-4 py-2.5 text-[#667085]">
        <ImageCellEditor product={product} {...imageProps} />
      </td>
    </tr>
  );
}

/** Fila de encabezado de familia + filas de cada variante cuando esta expandida (tabla desktop). */
function FamilyGroupRows({
  group,
  expanded,
  onToggle,
  ...imageProps
}: ImageEditorProps & { group: AdminFamilyGroup; expanded: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="bg-[#f7f8fa]/70">
        <td colSpan={7} className="px-4 py-2.5">
          <button
            type="button"
            onClick={onToggle}
            className="flex min-h-9 w-full items-center justify-between gap-2 text-left"
          >
            <span className="flex items-center gap-2">
              <span className="font-semibold text-[#111318]">{group.nombre}</span>
              <span className="text-xs text-[#98a2b3]">{group.marca}</span>
              <span className="rounded-full bg-[#eeebff] px-2 py-0.5 text-xs font-semibold text-[#5434e6]">
                {group.items.length} presentaciones
              </span>
            </span>
            {expanded ? <ChevronUp className="h-4 w-4 text-[#667085]" /> : <ChevronDown className="h-4 w-4 text-[#667085]" />}
          </button>
        </td>
      </tr>
      {expanded
        ? group.items.map((product) => (
            <tr key={product.id} className="bg-white">
              <td className="px-4 py-2.5 pl-8 text-[#111318]">
                {product.contenido || "—"}
                <span className="ml-2 font-mono text-[10px] text-[#98a2b3]">{product.sku}</span>
              </td>
              <td className="px-4 py-2.5 text-[#667085]">{product.marca}</td>
              <td className="px-4 py-2.5 text-[#111318]">{formatCurrency(product.precioVenta)}</td>
              <td className="px-4 py-2.5 text-[#667085]">{product.stockActual}</td>
              <td className="px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <EstadoBadge product={product} />
                  <IncompleteBadge product={product} />
                </div>
              </td>
              <td className="px-4 py-2.5 text-[#667085]">{product.esTop ? `#${product.ordenDestacado}` : "—"}</td>
              <td className="px-4 py-2.5 text-[#667085]">
                <ImageCellEditor product={product} {...imageProps} />
              </td>
            </tr>
          ))
        : null}
    </>
  );
}

function AdminProductMobileCard({ product, ...imageProps }: ImageEditorProps & { product: AdminProductRecord }) {
  return (
    <div className="rounded-2xl border border-[#e4e7ec] bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#98a2b3]">{product.marca}</p>
          <p className="truncate text-sm font-semibold text-[#111318]">{product.nombre}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          <EstadoBadge product={product} />
          <IncompleteBadge product={product} />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[#667085]">
        <span className="font-semibold text-[#111318]">{formatCurrency(product.precioVenta)}</span>
        <span>Stock: {product.stockActual}</span>
        {product.esTop ? <span>Top #{product.ordenDestacado}</span> : null}
      </div>
      <div className="mt-2">
        <ImageCellEditor product={product} {...imageProps} />
      </div>
    </div>
  );
}

/** Tarjeta de encabezado de familia + tarjetas de cada variante cuando esta expandida (mobile). */
function FamilyGroupMobileCard({
  group,
  expanded,
  onToggle,
  ...imageProps
}: ImageEditorProps & { group: AdminFamilyGroup; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-2xl border border-[#e4e7ec] bg-white shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex min-h-11 w-full items-center justify-between gap-2 p-4 text-left"
      >
        <span className="min-w-0">
          <span className="block text-xs font-semibold uppercase tracking-wide text-[#98a2b3]">{group.marca}</span>
          <span className="block truncate text-sm font-semibold text-[#111318]">{group.nombre}</span>
          <span className="mt-1 inline-block rounded-full bg-[#eeebff] px-2 py-0.5 text-xs font-semibold text-[#5434e6]">
            {group.items.length} presentaciones
          </span>
        </span>
        {expanded ? <ChevronUp className="h-4 w-4 shrink-0 text-[#667085]" /> : <ChevronDown className="h-4 w-4 shrink-0 text-[#667085]" />}
      </button>
      {expanded ? (
        <div className="space-y-2 border-t border-[#e4e7ec] p-4 pt-3">
          {group.items.map((product) => (
            <div key={product.id} className="rounded-xl bg-[#f7f8fa] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-[#111318]">{product.contenido || "—"}</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <EstadoBadge product={product} />
                  <IncompleteBadge product={product} />
                </div>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[#667085]">
                <span className="font-semibold text-[#111318]">{formatCurrency(product.precioVenta)}</span>
                <span>Stock: {product.stockActual}</span>
                <span className="font-mono text-[10px] text-[#98a2b3]">{product.sku}</span>
              </div>
              <div className="mt-2">
                <ImageCellEditor product={product} {...imageProps} />
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Indicador discreto (no tecnico) de que faltan datos obligatorios para publicar (Fase 2B.13). */
function IncompleteBadge({ product }: { product: AdminProductRecord }) {
  const missing = getMissingCatalogFields(product);
  if (missing.length === 0) return null;
  return (
    <span
      title={describeMissingCatalogFields(missing)}
      className="inline-flex items-center gap-1 rounded-full bg-[#fff8ec] px-2.5 py-0.5 text-xs font-semibold text-[#8a5a00]"
    >
      <AlertTriangle className="h-3 w-3" />
      Ficha incompleta
    </span>
  );
}

function EstadoBadge({ product }: { product: AdminProductRecord }) {
  if (!product.activo) {
    return (
      <span className="inline-flex rounded-full bg-[#f2f4f7] px-2.5 py-0.5 text-xs font-semibold text-[#475467]">
        Pausado
      </span>
    );
  }
  if (product.stockActual <= 0) {
    return (
      <span className="inline-flex rounded-full bg-[#fdf1ef] px-2.5 py-0.5 text-xs font-semibold text-[#8a2c22]">
        Sin stock
      </span>
    );
  }
  if (isStockBajo(product)) {
    return (
      <span className="inline-flex rounded-full bg-[#fff8ec] px-2.5 py-0.5 text-xs font-semibold text-[#8a5a00]">
        Stock bajo
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-[#eefbf1] px-2.5 py-0.5 text-xs font-semibold text-[#1f6d33]">
      Activo
    </span>
  );
}

function IndicatorTile({
  label,
  value,
  tone = "neutral",
  icon
}: {
  label: string;
  value: number;
  tone?: "good" | "bad" | "warn" | "neutral";
  icon?: React.ReactNode;
}) {
  const toneClasses: Record<typeof tone, string> = {
    good: "bg-[#eefbf1] text-[#1f6d33]",
    bad: "bg-[#fdf1ef] text-[#8a2c22]",
    warn: "bg-[#fff8ec] text-[#8a5a00]",
    neutral: "bg-[#f7f8fa] text-[#344054]"
  };

  return (
    <div className={`rounded-xl px-4 py-3 ${toneClasses[tone]}`}>
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide opacity-70">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}

/**
 * Estado vacio real (catalogo sin ningun producto, Fase 7.2) -- distinto de
 * "sin resultados para la busqueda". Solo aparece cuando indicators.total
 * es 0, nunca cuando hay productos pero el filtro/busqueda no matchea.
 */
function EmptyCatalogMessage({ onAddPerfume }: { onAddPerfume: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <p>Todavía no hay perfumes en el catálogo.</p>
      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={onAddPerfume}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#5434e6] px-4 py-2.5 text-sm font-semibold text-white"
        >
          <Plus className="h-4 w-4" />
          Agregar perfume
        </button>
        <Link
          href="/admin/importar-catalogo"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#e4e7ec] px-4 py-2.5 text-sm font-semibold text-[#344054]"
        >
          <UploadCloud className="h-4 w-4" />
          Importar catálogo
        </Link>
      </div>
    </div>
  );
}
