"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { AlertTriangle, CheckCircle2, Home, PackagePlus, Search, Sparkles, UploadCloud, X } from "lucide-react";
import Link from "next/link";
import { formatCurrency } from "@/lib/format";
import { filterAndSortProducts } from "@/lib/catalog-search";
import { getProductImageRenderConfig } from "@/lib/product-image-render";
import { TOP_PRODUCTS_LIMIT } from "@/lib/constants";
import type { AdminProductRecord } from "@/lib/types";

type Top12Producto = {
  id: string;
  sku?: string;
  nombre: string;
  marca?: string;
  contenido?: string;
  precioVenta: number;
  stockActual?: number;
  activo?: boolean;
};

type Top12Slot = {
  rank: number;
  imageUrl: string | null;
  producto: Top12Producto | null;
};

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Ocurrió un error.");
  return data;
}

type Top12FilterChoice = "todos" | "pendiente" | "asignado";

function mapUrlEstadoToTop12Filter(estado?: string): Top12FilterChoice {
  return estado === "pendiente" || estado === "asignado" ? estado : "todos";
}

type Top12AdminPanelProps = {
  /** True dentro del shell de /admin/catalogo/top12 (Fase 3A): encabezado compacto. */
  embedded?: boolean;
  /** Filtro inicial (`?estado=pendiente|asignado`), ver mapUrlEstadoToTop12Filter. */
  initialFilter?: string;
};

export function Top12AdminPanel({ embedded = false, initialFilter }: Top12AdminPanelProps = {}) {
  const [slots, setSlots] = useState<Top12Slot[]>([]);
  const [products, setProducts] = useState<AdminProductRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [activeRank, setActiveRank] = useState<number | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [unlinkingRank, setUnlinkingRank] = useState<number | null>(null);
  const [slotFilter, setSlotFilter] = useState<Top12FilterChoice>(() => mapUrlEstadoToTop12Filter(initialFilter));

  async function loadAll() {
    setLoading(true);
    setError("");
    try {
      const [top12Data, productsData] = await Promise.all([
        fetchJson("/api/admin/top12"),
        fetchJson("/api/admin/products")
      ]);
      setSlots(top12Data.slots ?? []);
      setProducts(productsData.products ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : `No fue posible cargar el Top ${TOP_PRODUCTS_LIMIT}.`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadInitial() {
      setLoading(true);
      setError("");
      try {
        const [top12Data, productsData] = await Promise.all([
          fetchJson("/api/admin/top12"),
          fetchJson("/api/admin/products")
        ]);
        if (!cancelled) {
          setSlots(top12Data.slots ?? []);
          setProducts(productsData.products ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : `No fue posible cargar el Top ${TOP_PRODUCTS_LIMIT}.`);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadInitial();
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleSlots = useMemo(() => {
    if (slotFilter === "pendiente") return slots.filter((slot) => !slot.producto);
    if (slotFilter === "asignado") return slots.filter((slot) => !!slot.producto);
    return slots;
  }, [slots, slotFilter]);

  const linkedProductIds = useMemo(
    () => new Set(slots.map((slot) => slot.producto?.id).filter((id): id is string => !!id)),
    [slots]
  );

  const pickerResults = useMemo(() => {
    if (!pickerQuery.trim()) return products.slice(0, 30);
    return filterAndSortProducts(products, { query: pickerQuery, sort: "nombre-asc" }).slice(0, 30) as AdminProductRecord[];
  }, [products, pickerQuery]);

  function openPicker(rank: number) {
    setActiveRank(rank);
    setPickerQuery("");
    setSelectedProductId(null);
  }

  function closePicker() {
    setActiveRank(null);
    setPickerQuery("");
    setSelectedProductId(null);
  }

  async function confirmLink() {
    if (activeRank === null || !selectedProductId) return;
    setLinking(true);
    setError("");
    try {
      await fetchJson("/api/admin/top12", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "vincular", rank: activeRank, productId: selectedProductId })
      });
      setNotice(`Posición ${activeRank} actualizada.`);
      closePicker();
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible vincular el producto.");
    } finally {
      setLinking(false);
    }
  }

  async function unlink(rank: number) {
    setUnlinkingRank(rank);
    setError("");
    try {
      await fetchJson("/api/admin/top12", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "desvincular", rank })
      });
      setNotice(`Posición ${rank} liberada.`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible liberar la posición.");
    } finally {
      setUnlinkingRank(null);
    }
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
                <h1 className="text-3xl font-bold tracking-[-0.04em] text-white sm:text-4xl">Top {TOP_PRODUCTS_LIMIT} editorial</h1>
                <p className="max-w-2xl text-sm leading-6 text-white/60 sm:text-base">
                  Elige a mano los {TOP_PRODUCTS_LIMIT} perfumes destacados de la portada. No se calcula por
                  ventas: cada posición usa siempre la misma fotografía y tú eliges qué producto va en cada una.
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
          </div>
        </section>
      ) : null}

      {error ? (
        <div className="flex items-start gap-2 rounded-xl border border-[#f3c6c0] bg-[#fdf1ef] px-4 py-3 text-sm text-[#8a2c22]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}
      {notice ? (
        <div className="flex items-start gap-2 rounded-xl border border-[#bfe6c6] bg-[#eefbf1] px-4 py-3 text-sm text-[#1f6d33]">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </div>
      ) : null}

      <p className="text-sm font-semibold text-[#344054]">
        Top {TOP_PRODUCTS_LIMIT}: {slots.filter((slot) => !!slot.producto).length} de {TOP_PRODUCTS_LIMIT} seleccionados
      </p>

      {!loading && products.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-[#e4e7ec] bg-white p-6 text-sm text-[#667085]">
          <p>
            Todavía no hay perfumes en el catálogo. Primero agrega o importa productos para poder elegir el
            Top {TOP_PRODUCTS_LIMIT}.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/catalogo/productos"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#e4e7ec] px-4 py-2.5 text-sm font-semibold text-[#344054]"
            >
              <PackagePlus className="h-4 w-4" />
              Ir a Productos
            </Link>
            <Link
              href="/admin/importar-catalogo"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#e4e7ec] px-4 py-2.5 text-sm font-semibold text-[#344054]"
            >
              <UploadCloud className="h-4 w-4" />
              Importar catálogo
            </Link>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: "todos", label: `Todas (${slots.length})` },
            { id: "pendiente", label: `Pendientes (${slots.filter((s) => !s.producto).length})` },
            { id: "asignado", label: `Asignadas (${slots.filter((s) => !!s.producto).length})` }
          ] as Array<{ id: Top12FilterChoice; label: string }>
        ).map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setSlotFilter(option.id)}
            className={`min-h-9 rounded-full border px-3 py-1.5 text-xs font-semibold ${
              slotFilter === option.id
                ? "border-[#7357ff] bg-[#eeebff] text-[#5434e6]"
                : "border-[#e4e7ec] bg-white text-[#667085]"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-[#667085]">Cargando Top {TOP_PRODUCTS_LIMIT}...</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {visibleSlots.length === 0 ? (
            <p className="col-span-full py-6 text-center text-sm text-[#667085]">
              Sin posiciones en esta categoría.
            </p>
          ) : null}
          {visibleSlots.map((slot) => {
            const producto = slot.producto;
            const sinStock = !!producto && (producto.stockActual ?? 0) <= 0;
            const pausado = !!producto && producto.activo === false;

            return (
              <div key={slot.rank} className="flex flex-col gap-3 rounded-2xl border border-[#e4e7ec] bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#eeebff] text-xs font-bold text-[#5434e6]">
                    {slot.rank}
                  </span>
                  {producto ? (
                    <button
                      type="button"
                      onClick={() => unlink(slot.rank)}
                      disabled={unlinkingRank === slot.rank}
                      title={`Quitar del Top ${TOP_PRODUCTS_LIMIT}`}
                      className="rounded-lg p-1 text-[#98a2b3] hover:bg-[#f7f8fa] hover:text-[#8a2c22] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>

                <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-[#f7f8fa]">
                  {slot.imageUrl
                    ? (() => {
                        // Misma URL same-origin que usa ProductImage en el resto del admin
                        // (getProductImageRenderConfig): el navegador nunca depende
                        // directamente de Supabase Storage. No se toca la logica editorial.
                        const renderConfig = getProductImageRenderConfig(slot.imageUrl);
                        return (
                          <Image
                            src={renderConfig.src}
                            alt={producto?.nombre ?? `Posición ${slot.rank}`}
                            fill
                            unoptimized={renderConfig.unoptimized}
                            sizes="200px"
                            className="object-contain p-2"
                          />
                        );
                      })()
                    : null}
                </div>

                {producto ? (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#98a2b3]">{producto.marca}</p>
                    <p className="line-clamp-2 text-sm font-semibold text-[#111318]">{producto.nombre}</p>
                    <p className="text-xs text-[#667085]">{producto.contenido}</p>
                    <p className="text-sm font-bold text-[#111318]">{formatCurrency(producto.precioVenta)}</p>
                    {pausado ? (
                      <p className="rounded-lg bg-[#f2f4f7] px-2 py-1 text-xs font-semibold text-[#475467]">
                        Pausado: oculto del Top {TOP_PRODUCTS_LIMIT} público
                      </p>
                    ) : sinStock ? (
                      <p className="rounded-lg bg-[#fff8ec] px-2 py-1 text-xs font-semibold text-[#8a5a00]">
                        Sin stock: oculto del Top {TOP_PRODUCTS_LIMIT} público
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-sm text-[#98a2b3]">Posición vacía</p>
                )}

                <button
                  type="button"
                  onClick={() => openPicker(slot.rank)}
                  className="mt-auto inline-flex min-h-11 items-center justify-center rounded-xl border border-[#e4e7ec] px-3 py-2 text-sm font-semibold text-[#5434e6]"
                >
                  {producto ? "Cambiar producto" : "Vincular producto"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {activeRank !== null ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="flex max-h-[80vh] w-full max-w-lg flex-col gap-4 rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[#111318]">Posición {activeRank}</h3>
              <button type="button" onClick={closePicker} className="rounded-lg p-1 text-[#98a2b3] hover:bg-[#f7f8fa]">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98a2b3]" />
              <input
                type="search"
                autoFocus
                value={pickerQuery}
                onChange={(event) => setPickerQuery(event.target.value)}
                placeholder="Buscar por nombre, marca o SKU"
                aria-label="Buscar producto para vincular"
                className="w-full rounded-xl border border-[#e4e7ec] bg-white py-2.5 pl-9 pr-3 text-sm text-[#111318] outline-none focus:border-[#7357ff]"
              />
            </div>

            <div className="flex-1 space-y-1 overflow-y-auto">
              {pickerResults.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => setSelectedProductId(product.id)}
                  className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-sm ${
                    selectedProductId === product.id
                      ? "border-[#7357ff] bg-[#f7f5ff]"
                      : "border-transparent hover:bg-[#f7f8fa]"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-[#111318]">{product.nombre}</span>
                    <span className="block truncate text-xs text-[#667085]">
                      {product.marca} · {product.contenido}
                      {linkedProductIds.has(product.id) ? ` · Ya está en el Top ${TOP_PRODUCTS_LIMIT}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-[#344054]">
                    {formatCurrency(product.precioVenta)}
                  </span>
                </button>
              ))}
              {pickerResults.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-[#667085]">Sin resultados.</p>
              ) : null}
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={closePicker}
                className="rounded-xl border border-[#e4e7ec] px-4 py-2 text-sm font-semibold text-[#344054]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmLink}
                disabled={!selectedProductId || linking}
                className="app-button-primary inline-flex min-h-11 items-center justify-center px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              >
                {linking ? "Vinculando..." : "Vincular"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
