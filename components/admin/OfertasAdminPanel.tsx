"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  Home,
  PackagePlus,
  Search,
  Tag,
  UploadCloud,
  X
} from "lucide-react";
import Link from "next/link";
import { ProductImage } from "@/components/ProductImage";
import { formatCurrency } from "@/lib/format";
import { filterAndSortProducts } from "@/lib/catalog-search";
import { OffersSection } from "@/components/shared/OffersSection";
import { OFFERS_LIMIT } from "@/lib/constants";
import type { AdminProductRecord, ProductRecord } from "@/lib/types";

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Ocurrió un error.");
  return data;
}

type OfertasFilterChoice = "todos" | "en-oferta" | "fuera-de-oferta";

type OfertasAdminPanelProps = {
  /** True dentro del shell de /admin/catalogo/ofertas: encabezado compacto. */
  embedded?: boolean;
};

/**
 * Panel editorial de "Ofertas de la semana" (Fase 7.4). La oferta es un
 * atributo del producto (es_oferta_semana + precio_anterior), igual que el
 * Top 15 -- no crea una tabla ni un carrito separado. Un mismo producto
 * puede estar en Top 15, en Ofertas y en el catálogo completo a la vez sin
 * duplicar su ficha ni su stock.
 */
export function OfertasAdminPanel({ embedded = false }: OfertasAdminPanelProps = {}) {
  const [products, setProducts] = useState<AdminProductRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<OfertasFilterChoice>("todos");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [precioAnteriorDrafts, setPrecioAnteriorDrafts] = useState<Record<string, string>>({});
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewProducts, setPreviewProducts] = useState<ProductRecord[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");

  async function loadAll() {
    setLoading(true);
    setError("");
    try {
      const data = await fetchJson("/api/admin/products");
      setProducts(data.products ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible cargar los productos.");
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
        const data = await fetchJson("/api/admin/products");
        if (!cancelled) setProducts(data.products ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "No fue posible cargar los productos.");
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

  const ofertasActivas = useMemo(() => products.filter((product) => product.esOfertaSemana), [products]);
  const ofertasCount = ofertasActivas.length;
  const maxAlcanzado = ofertasCount >= OFFERS_LIMIT;

  const visibleProducts = useMemo(() => {
    const base = filter === "todos" ? products : products.filter((product) => product.esOfertaSemana === (filter === "en-oferta"));
    if (!query.trim()) return base.slice(0, 60);
    return filterAndSortProducts(base, { query, sort: "nombre-asc" }).slice(0, 60) as AdminProductRecord[];
  }, [products, query, filter]);

  async function togglePreview() {
    if (previewOpen) {
      setPreviewOpen(false);
      return;
    }
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewError("");
    try {
      // Mismo endpoint publico (/api/products) y mismo componente
      // (OffersSection) que usa la portada: sin reimplementar el filtro.
      const data = await fetchJson("/api/products");
      setPreviewProducts(data.products ?? []);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "No fue posible cargar la vista previa pública.");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function activar(product: AdminProductRecord) {
    if (maxAlcanzado) return;
    setPendingId(product.id);
    setError("");
    try {
      const draft = precioAnteriorDrafts[product.id]?.trim();
      const precioAnterior = draft ? Number(draft) : undefined;
      await fetchJson("/api/admin/ofertas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "activar", productId: product.id, precioAnterior })
      });
      setNotice(`${product.nombre} agregado a Ofertas de la semana.`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible activar la oferta.");
    } finally {
      setPendingId(null);
    }
  }

  async function desactivar(product: AdminProductRecord) {
    setPendingId(product.id);
    setError("");
    try {
      await fetchJson("/api/admin/ofertas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "desactivar", productId: product.id })
      });
      setNotice(`${product.nombre} quitado de Ofertas de la semana.`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible quitar la oferta.");
    } finally {
      setPendingId(null);
    }
  }

  async function guardarPrecioAnterior(product: AdminProductRecord) {
    setPendingId(product.id);
    setError("");
    try {
      const draft = precioAnteriorDrafts[product.id]?.trim();
      const precioAnterior = draft ? Number(draft) : undefined;
      await fetchJson("/api/admin/ofertas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "activar", productId: product.id, precioAnterior })
      });
      setNotice(`Precio anterior de ${product.nombre} actualizado.`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible guardar el precio anterior.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <main
      className={
        embedded
          ? "flex w-full min-w-0 max-w-full flex-col gap-6 overflow-x-hidden"
          : "mx-auto flex min-h-[100dvh] w-full max-w-[1100px] flex-col gap-6 overflow-x-hidden bg-[#f7f8fa] px-4 py-4 pb-[calc(88px+env(safe-area-inset-bottom))] sm:px-6 lg:px-8"
      }
    >
      {!embedded ? (
        <section className="overflow-hidden rounded-2xl bg-[#17191f] text-white shadow-[0_16px_36px_rgba(17,19,24,0.16)]">
          <div className="bg-[radial-gradient(circle_at_80%_20%,rgba(115,87,255,0.34),transparent_28%)] p-6 sm:p-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-2">
                <span className="inline-flex w-fit items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#c8c0ff]">
                  <Tag className="h-3.5 w-3.5" />
                  Admin Smellme.cl
                </span>
                <h1 className="text-3xl font-bold tracking-[-0.04em] text-white sm:text-4xl">Ofertas de la semana</h1>
                <p className="max-w-2xl text-sm leading-6 text-white/60 sm:text-base">
                  Elige hasta {OFFERS_LIMIT} perfumes en oferta. El precio anterior es opcional y nunca se
                  calcula solo: si no lo cargas, la tarjeta pública no muestra precio tachado.
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-[#344054]">
          Ofertas: {ofertasCount} de {OFFERS_LIMIT} seleccionadas
        </p>
        <button
          type="button"
          onClick={() => void togglePreview()}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#e4e7ec] bg-white px-3 py-2 text-sm font-semibold text-[#344054]"
          aria-expanded={previewOpen}
        >
          {previewOpen ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {previewOpen ? "Ocultar vista previa" : "Vista previa pública"}
        </button>
      </div>

      {maxAlcanzado ? (
        <p className="rounded-xl bg-[#fff8ec] px-3 py-2 text-xs font-semibold text-[#8a5a00]">
          Alcanzaste el máximo de {OFFERS_LIMIT} ofertas. Quita una para agregar otra.
        </p>
      ) : null}

      {previewOpen ? (
        <section className="rounded-2xl border border-[#e4e7ec] bg-[#f7f8fa] p-4 sm:p-5" aria-label="Vista previa pública de Ofertas de la semana">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#98a2b3]">
            Así se ve en la portada (mismo componente y datos que el catálogo público)
          </p>
          {previewLoading ? (
            <p className="text-sm text-[#667085]">Cargando vista previa...</p>
          ) : previewError ? (
            <div className="flex items-start gap-2 rounded-xl border border-[#f3c6c0] bg-[#fdf1ef] px-4 py-3 text-sm text-[#8a2c22]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{previewError}</span>
            </div>
          ) : (
            <OffersSection products={previewProducts} quantities={{}} onAdd={() => {}} />
          )}
        </section>
      ) : null}

      {!loading && products.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-[#e4e7ec] bg-white p-6 text-sm text-[#667085]">
          <p>Todavía no hay perfumes en el catálogo. Primero agrega o importa productos para poder elegir ofertas.</p>
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
            { id: "todos", label: `Todos (${products.length})` },
            { id: "en-oferta", label: `En oferta (${ofertasCount})` },
            { id: "fuera-de-oferta", label: `Fuera de oferta (${products.length - ofertasCount})` }
          ] as Array<{ id: OfertasFilterChoice; label: string }>
        ).map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setFilter(option.id)}
            className={`min-h-9 rounded-full border px-3 py-1.5 text-xs font-semibold ${
              filter === option.id
                ? "border-[#7357ff] bg-[#eeebff] text-[#5434e6]"
                : "border-[#e4e7ec] bg-white text-[#667085]"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98a2b3]" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por nombre, marca o SKU"
          aria-label="Buscar producto para agregar a ofertas"
          className="w-full rounded-xl border border-[#e4e7ec] bg-white py-2.5 pl-9 pr-3 text-sm text-[#111318] outline-none focus:border-[#7357ff]"
        />
      </div>

      {loading ? (
        <p className="text-sm text-[#667085]">Cargando ofertas...</p>
      ) : (
        <div className="flex flex-col gap-2">
          {visibleProducts.length === 0 ? (
            <p className="py-6 text-center text-sm text-[#667085]">Sin resultados.</p>
          ) : null}
          {visibleProducts.map((product) => {
            const enOferta = product.esOfertaSemana;
            const sinStock = (product.stockActual ?? 0) <= 0;
            const pausado = product.activo === false;
            const draft = precioAnteriorDrafts[product.id] ?? (product.precioAnterior ? String(product.precioAnterior) : "");

            return (
              <div
                key={product.id}
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#e4e7ec] bg-white p-3 shadow-sm sm:flex-nowrap"
              >
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-[#f7f8fa]">
                  <ProductImage src={product.imageUrl} alt={product.nombre} brand={product.marca} compact sizes="56px" />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold uppercase tracking-wide text-[#98a2b3]">{product.marca}</p>
                  <p className="truncate text-sm font-semibold text-[#111318]">{product.nombre}</p>
                  <p className="text-xs text-[#667085]">
                    {formatCurrency(product.precioVenta)}
                    {pausado ? " · Pausado" : sinStock ? " · Sin stock" : ""}
                  </p>
                </div>

                {enOferta ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      value={draft}
                      onChange={(event) =>
                        setPrecioAnteriorDrafts((current) => ({ ...current, [product.id]: event.target.value }))
                      }
                      placeholder="Precio anterior"
                      aria-label={`Precio anterior de ${product.nombre}`}
                      className="w-28 rounded-lg border border-[#e4e7ec] px-2 py-2 text-sm text-[#111318] outline-none focus:border-[#7357ff]"
                    />
                    <button
                      type="button"
                      onClick={() => void guardarPrecioAnterior(product)}
                      disabled={pendingId === product.id}
                      className="min-h-11 rounded-lg border border-[#e4e7ec] px-2.5 py-2 text-xs font-semibold text-[#344054] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Guardar
                    </button>
                  </div>
                ) : null}

                {enOferta ? (
                  <button
                    type="button"
                    onClick={() => void desactivar(product)}
                    disabled={pendingId === product.id}
                    title="Quitar de Ofertas de la semana"
                    className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-[#e4e7ec] px-3 py-2 text-sm font-semibold text-[#8a2c22] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <X className="h-4 w-4" />
                    Quitar
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void activar(product)}
                    disabled={pendingId === product.id || maxAlcanzado}
                    title={maxAlcanzado ? `Alcanzaste el máximo de ${OFFERS_LIMIT} ofertas` : "Agregar a Ofertas de la semana"}
                    className="app-button-primary inline-flex min-h-11 shrink-0 items-center justify-center px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Agregar
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
