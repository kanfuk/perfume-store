"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  CircleDollarSign,
  Home,
  ImageOff,
  Sparkles,
  UploadCloud
} from "lucide-react";
import Link from "next/link";
import { formatCurrency } from "@/lib/format";
import { getAvailableBrands, filterAndSortProducts } from "@/lib/catalog-search";
import type { AdminProductRecord } from "@/lib/types";

type ChipFilter = "todos" | "activos" | "pausados" | "sin-stock" | "stock-bajo" | "top12" | "sin-imagen";

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Ocurrió un error.");
  return data;
}

function isStockBajo(product: AdminProductRecord) {
  return product.stockActual > 0 && product.stockActual <= (product.stockMinimo || 1);
}

export function CatalogControlCenter() {
  const [products, setProducts] = useState<AdminProductRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [chip, setChip] = useState<ChipFilter>("todos");
  const [editingImageId, setEditingImageId] = useState<string | null>(null);
  const [imageDraft, setImageDraft] = useState("");
  const [savingImage, setSavingImage] = useState(false);

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
          setError(err instanceof Error ? err.message : "No fue posible cargar el catálogo.");
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

  const brands = useMemo(() => getAvailableBrands(products), [products]);

  const indicators = useMemo(
    () => ({
      total: products.length,
      activos: products.filter((p) => p.activo).length,
      pausados: products.filter((p) => !p.activo).length,
      sinStock: products.filter((p) => p.stockActual <= 0).length,
      stockBajo: products.filter(isStockBajo).length,
      sinImagen: products.filter((p) => !p.imageUrl).length
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
      default:
        return products;
    }
  }, [products, chip]);

  const filtered = useMemo(
    () => filterAndSortProducts(chipFiltered, { query, brand: brandFilter, sort: "nombre-asc" }) as AdminProductRecord[],
    [chipFiltered, query, brandFilter]
  );

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

  const chips: Array<{ id: ChipFilter; label: string; count: number }> = [
    { id: "todos", label: "Todos", count: indicators.total },
    { id: "activos", label: "Activos", count: indicators.activos },
    { id: "pausados", label: "Pausados", count: indicators.pausados },
    { id: "sin-stock", label: "Sin stock", count: indicators.sinStock },
    { id: "stock-bajo", label: "Stock bajo", count: indicators.stockBajo },
    { id: "top12", label: "Top 12", count: products.filter((p) => p.esTop).length },
    { id: "sin-imagen", label: "Sin imagen", count: indicators.sinImagen }
  ];

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-[1400px] flex-col gap-6 overflow-x-hidden bg-[#f7f8fa] px-4 py-4 pb-[calc(88px+env(safe-area-inset-bottom))] sm:px-6 lg:px-8">
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
              href="/admin/stock"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white"
            >
              <Boxes className="h-4 w-4" />
              Stock rápido
            </Link>
            <Link
              href="/admin/precios"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white"
            >
              <CircleDollarSign className="h-4 w-4" />
              Precios
            </Link>
            <Link
              href="/admin/top12"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white"
            >
              <Sparkles className="h-4 w-4" />
              Top 12
            </Link>
          </div>
        </div>
      </section>

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
      </section>

      <section className="space-y-4 rounded-2xl border border-[#e4e7ec] bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap gap-2">
          {chips.map((chipOption) => (
            <button
              key={chipOption.id}
              type="button"
              onClick={() => setChip(chipOption.id)}
              className={`min-h-9 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                chip === chipOption.id
                  ? "border-[#7357ff] bg-[#eeebff] text-[#5434e6]"
                  : "border-[#e4e7ec] bg-white text-[#667085]"
              }`}
            >
              {chipOption.label} ({chipOption.count})
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre, marca o SKU"
            aria-label="Buscar productos"
            className="rounded-xl border border-[#e4e7ec] bg-white px-3 py-2.5 text-sm text-[#344054]"
          />
          <select
            value={brandFilter}
            onChange={(event) => setBrandFilter(event.target.value)}
            aria-label="Filtrar por marca"
            className="rounded-xl border border-[#e4e7ec] bg-white px-3 py-2.5 text-sm text-[#344054]"
          >
            <option value="">Todas las marcas</option>
            {brands.map((brand) => (
              <option key={brand} value={brand}>
                {brand}
              </option>
            ))}
          </select>
        </div>

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
                    <th className="px-4 py-3">Top 12</th>
                    <th className="px-4 py-3">Imagen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eef0f3]">
                  {filtered.map((product) => (
                    <tr key={product.id}>
                      <td className="px-4 py-2.5 text-[#111318]">{product.nombre}</td>
                      <td className="px-4 py-2.5 text-[#667085]">{product.marca}</td>
                      <td className="px-4 py-2.5 text-[#111318]">{formatCurrency(product.precioVenta)}</td>
                      <td className="px-4 py-2.5 text-[#667085]">{product.stockActual}</td>
                      <td className="px-4 py-2.5">
                        <EstadoBadge product={product} />
                      </td>
                      <td className="px-4 py-2.5 text-[#667085]">{product.esTop ? `#${product.ordenDestacado}` : "—"}</td>
                      <td className="px-4 py-2.5 text-[#667085]">
                        {editingImageId === product.id ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={imageDraft}
                              onChange={(event) => setImageDraft(event.target.value)}
                              placeholder="https://... o /images/..."
                              className="w-48 rounded-lg border border-[#e4e7ec] px-2 py-1 text-xs"
                            />
                            <button
                              type="button"
                              onClick={() => saveImage(product)}
                              disabled={savingImage}
                              className="rounded-lg bg-[#5434e6] px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                            >
                              Guardar
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditingImage}
                              className="rounded-lg border border-[#e4e7ec] px-2 py-1 text-xs font-semibold text-[#344054]"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : product.imageUrl ? (
                          "Sí"
                        ) : (
                          <button
                            type="button"
                            onClick={() => startEditingImage(product)}
                            className="rounded-lg border border-[#e4e7ec] px-2 py-1 text-xs font-semibold text-[#5434e6]"
                          >
                            Asignar imagen
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-sm text-[#667085]">
                        Sin productos que coincidan con la búsqueda.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 md:hidden">
              {filtered.map((product) => (
                <div key={product.id} className="rounded-2xl border border-[#e4e7ec] bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#98a2b3]">{product.marca}</p>
                      <p className="truncate text-sm font-semibold text-[#111318]">{product.nombre}</p>
                    </div>
                    <EstadoBadge product={product} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[#667085]">
                    <span className="font-semibold text-[#111318]">{formatCurrency(product.precioVenta)}</span>
                    <span>Stock: {product.stockActual}</span>
                    {product.esTop ? <span>Top #{product.ordenDestacado}</span> : null}
                  </div>
                  {!product.imageUrl ? (
                    editingImageId === product.id ? (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <input
                          type="text"
                          value={imageDraft}
                          onChange={(event) => setImageDraft(event.target.value)}
                          placeholder="https://... o /images/..."
                          className="min-h-9 flex-1 rounded-lg border border-[#e4e7ec] px-2 py-1 text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => saveImage(product)}
                          disabled={savingImage}
                          className="min-h-9 rounded-lg bg-[#5434e6] px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          onClick={cancelEditingImage}
                          className="min-h-9 rounded-lg border border-[#e4e7ec] px-2 py-1 text-xs font-semibold text-[#344054]"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEditingImage(product)}
                        className="mt-2 min-h-9 rounded-lg border border-[#e4e7ec] px-2 py-1 text-xs font-semibold text-[#5434e6]"
                      >
                        Asignar imagen
                      </button>
                    )
                  ) : null}
                </div>
              ))}
              {filtered.length === 0 ? (
                <p className="py-6 text-center text-sm text-[#667085]">Sin productos que coincidan con la búsqueda.</p>
              ) : null}
            </div>
          </>
        )}
      </section>
    </main>
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
