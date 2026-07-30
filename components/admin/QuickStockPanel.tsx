"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Home, Minus, Plus, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { getAvailableBrands, filterAndSortProducts } from "@/lib/catalog-search";
import type { AdminProductRecord } from "@/lib/types";
import type { BulkStockOperation } from "@/services/productoService";

type QuickFilter = "todos" | "sin-stock" | "stock-uno" | "activos" | "pausados";
type BulkActionChoice = "sumar" | "restar" | "establecer" | "activar" | "pausar";

type BulkPreviewRow = {
  id: string;
  sku: string;
  nombre: string;
  stockAnterior: number;
  stockNuevo: number;
  activoAnterior: boolean;
  activoNuevo: boolean;
};

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Ocurrió un error.");
  return data;
}

export function QuickStockPanel() {
  const [products, setProducts] = useState<AdminProductRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [query, setQuery] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("todos");

  const [savingId, setSavingId] = useState<string | null>(null);
  const [stockDrafts, setStockDrafts] = useState<Record<string, string>>({});

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<BulkActionChoice>("sumar");
  const [bulkValue, setBulkValue] = useState("1");
  const [bulkPreview, setBulkPreview] = useState<{ productos: BulkPreviewRow[]; erroresGlobales: string[] } | null>(
    null
  );
  const [bulkPreviewHash, setBulkPreviewHash] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkConfirming, setBulkConfirming] = useState(false);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);

  async function loadProducts() {
    setLoading(true);
    setError("");
    try {
      const data = await fetchJson("/api/admin/products");
      setProducts(data.products ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible cargar el catálogo.");
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

  const filtered = useMemo(() => {
    let list = filterAndSortProducts(products, { query, brand: brandFilter, sort: "nombre-asc" }) as AdminProductRecord[];
    if (quickFilter === "sin-stock") list = list.filter((p) => p.stockActual <= 0);
    if (quickFilter === "stock-uno") list = list.filter((p) => p.stockActual === 1);
    if (quickFilter === "activos") list = list.filter((p) => p.activo);
    if (quickFilter === "pausados") list = list.filter((p) => !p.activo);
    return list;
  }, [products, query, brandFilter, quickFilter]);

  function displayStock(product: AdminProductRecord): string {
    return stockDrafts[product.id] ?? String(product.stockActual);
  }

  function patchLocalProduct(id: string, patch: Partial<AdminProductRecord>) {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  async function applyStockChange(
    product: AdminProductRecord,
    request: () => Promise<{ stockActual: number; activo: boolean }>
  ) {
    const previous = { stockActual: product.stockActual, activo: product.activo };
    setSavingId(product.id);
    setError("");
    try {
      const result = await request();
      patchLocalProduct(product.id, { stockActual: result.stockActual, activo: result.activo });
      setStockDrafts((prev) => {
        const next = { ...prev };
        delete next[product.id];
        return next;
      });
    } catch (err) {
      patchLocalProduct(product.id, previous);
      setError(err instanceof Error ? err.message : "No fue posible actualizar el stock.");
    } finally {
      setSavingId(null);
    }
  }

  function increment(product: AdminProductRecord) {
    return applyStockChange(product, async () => {
      const data = await fetchJson(`/api/admin/products/${product.id}/stock`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delta: 1 })
      });
      return { stockActual: data.stockActual, activo: data.activo };
    });
  }

  function decrement(product: AdminProductRecord) {
    return applyStockChange(product, async () => {
      const data = await fetchJson(`/api/admin/products/${product.id}/stock`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delta: -1 })
      });
      return { stockActual: data.stockActual, activo: data.activo };
    });
  }

  function commitDraft(product: AdminProductRecord) {
    const draft = stockDrafts[product.id];
    if (draft === undefined) return;
    const valor = Number(draft);
    if (!Number.isFinite(valor)) {
      setError("El stock debe ser un número.");
      return;
    }
    return applyStockChange(product, async () => {
      const data = await fetchJson(`/api/admin/products/${product.id}/stock`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "set", valor })
      });
      return { stockActual: data.stockActual, activo: data.activo };
    });
  }

  function agotar(product: AdminProductRecord) {
    return applyStockChange(product, async () => {
      const data = await fetchJson(`/api/admin/products/${product.id}/stock`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "agotar" })
      });
      return { stockActual: data.stockActual, activo: data.activo };
    });
  }

  async function toggleActivo(product: AdminProductRecord) {
    const nuevoActivo = !product.activo;
    const previous = product.activo;
    setSavingId(product.id);
    setError("");
    try {
      await fetchJson(`/api/admin/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "toggle", activo: nuevoActivo })
      });
      patchLocalProduct(product.id, { activo: nuevoActivo });
    } catch (err) {
      patchLocalProduct(product.id, { activo: previous });
      setError(err instanceof Error ? err.message : "No fue posible cambiar el estado.");
    } finally {
      setSavingId(null);
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setBulkPreview(null);
  }

  function buildBulkOperation(): BulkStockOperation {
    if (bulkAction === "sumar") return { type: "sumar", cantidad: Number(bulkValue) };
    if (bulkAction === "restar") return { type: "restar", cantidad: Number(bulkValue) };
    if (bulkAction === "establecer") return { type: "establecer", valor: Number(bulkValue) };
    if (bulkAction === "activar") return { type: "activar" };
    return { type: "pausar" };
  }

  async function requestBulkPreview() {
    if (selectedIds.size === 0) {
      setError("Selecciona al menos un producto para la acción masiva.");
      return;
    }
    setBulkLoading(true);
    setError("");
    try {
      const data = await fetchJson("/api/admin/products/bulk-stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview", productIds: [...selectedIds], operation: buildBulkOperation() })
      });
      setBulkPreview(data.preview);
      setBulkPreviewHash(data.previewHash);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible calcular la acción masiva.");
    } finally {
      setBulkLoading(false);
    }
  }

  async function confirmBulk() {
    setBulkConfirmOpen(false);
    setBulkConfirming(true);
    setError("");
    try {
      const data = await fetchJson("/api/admin/products/bulk-stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "confirm",
          productIds: [...selectedIds],
          operation: buildBulkOperation(),
          previewHash: bulkPreviewHash
        })
      });
      setNotice(`Acción masiva aplicada: ${data.actualizados} productos actualizados.`);
      setBulkPreview(null);
      setBulkPreviewHash("");
      setSelectedIds(new Set());
      await loadProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible aplicar la acción masiva.");
    } finally {
      setBulkConfirming(false);
    }
  }

  const quickFilters: Array<{ id: QuickFilter; label: string }> = [
    { id: "todos", label: "Todos" },
    { id: "sin-stock", label: "Solo sin stock" },
    { id: "stock-uno", label: "Solo stock 1" },
    { id: "activos", label: "Solo activos" },
    { id: "pausados", label: "Solo pausados" }
  ];

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-[1400px] flex-col gap-6 overflow-x-hidden bg-[#f7f8fa] px-4 py-4 pb-[calc(88px+env(safe-area-inset-bottom))] sm:px-6 lg:px-8">
      <section className="overflow-hidden rounded-2xl bg-[#17191f] text-white shadow-[0_16px_36px_rgba(17,19,24,0.16)]">
        <div className="bg-[radial-gradient(circle_at_80%_20%,rgba(115,87,255,0.34),transparent_28%)] p-6 sm:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <span className="inline-flex w-fit items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#c8c0ff]">
                <ShoppingBag className="h-3.5 w-3.5" />
                Admin Smellme.cl
              </span>
              <h1 className="text-3xl font-bold tracking-[-0.04em] text-white sm:text-4xl">Stock rápido</h1>
              <p className="max-w-2xl text-sm leading-6 text-white/60 sm:text-base">
                Revisa y ajusta stock y estado sin abrir cada producto. No modifica precio, imagen ni Top 12.
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

      <section className="space-y-4 rounded-2xl border border-[#e4e7ec] bg-white p-5 shadow-sm sm:p-6">
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

        <div className="flex flex-wrap gap-2">
          {quickFilters.map((filterOption) => (
            <button
              key={filterOption.id}
              type="button"
              onClick={() => setQuickFilter(filterOption.id)}
              className={`min-h-9 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                quickFilter === filterOption.id
                  ? "border-[#7357ff] bg-[#eeebff] text-[#5434e6]"
                  : "border-[#e4e7ec] bg-white text-[#667085]"
              }`}
            >
              {filterOption.label}
            </button>
          ))}
        </div>

        <p className="text-sm text-[#667085]">
          {filtered.length} producto(s) · {selectedIds.size} seleccionado(s)
        </p>

        {loading ? (
          <p className="text-sm text-[#667085]">Cargando catálogo...</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((product) => {
              const saving = savingId === product.id;
              const disponible = product.stockActual - (product.stockReservado ?? 0);

              return (
                <div key={product.id} className="flex flex-col gap-3 rounded-2xl border border-[#e4e7ec] bg-white p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(product.id)}
                      onChange={() => toggleSelected(product.id)}
                      aria-label={`Seleccionar ${product.nombre}`}
                      className="mt-1 h-4 w-4"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#98a2b3]">{product.marca}</p>
                      <p className="truncate text-sm font-semibold text-[#111318]">{product.nombre}</p>
                      <p className="text-xs text-[#98a2b3]">
                        {product.contenido}
                        {product.sku ? <span className="ml-1 font-mono text-[#c0c5cf]">· {product.sku}</span> : null}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        product.activo ? "bg-[#eefbf1] text-[#1f6d33]" : "bg-[#f2f4f7] text-[#475467]"
                      }`}
                    >
                      {product.activo ? "Activo" : "Pausado"}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#667085]">
                    <span
                      className={`rounded-full px-2 py-0.5 font-semibold ${
                        product.stockActual <= 0
                          ? "bg-[#fdf1ef] text-[#8a2c22]"
                          : product.stockActual <= (product.stockMinimo || 1)
                            ? "bg-[#fff8ec] text-[#8a5a00]"
                            : "bg-[#eefbf1] text-[#1f6d33]"
                      }`}
                    >
                      {product.stockActual <= 0 ? "Sin stock" : product.stockActual <= (product.stockMinimo || 1) ? "Stock bajo" : "Disponible"}
                    </span>
                    {(product.stockReservado ?? 0) > 0 ? <span>Reservado: {product.stockReservado}</span> : null}
                    <span>Disponible real: {Math.max(0, disponible)}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => decrement(product)}
                      disabled={saving || product.stockActual <= 0}
                      aria-label={`Restar stock a ${product.nombre}`}
                      className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#e4e7ec] text-[#344054] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={displayStock(product)}
                      onChange={(event) => setStockDrafts((prev) => ({ ...prev, [product.id]: event.target.value }))}
                      onBlur={() => commitDraft(product)}
                      disabled={saving}
                      aria-label={`Stock de ${product.nombre}`}
                      className="h-11 w-20 rounded-xl border border-[#e4e7ec] px-2 text-center text-sm font-semibold"
                    />
                    <button
                      type="button"
                      onClick={() => increment(product)}
                      disabled={saving}
                      aria-label={`Sumar stock a ${product.nombre}`}
                      className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#e4e7ec] text-[#344054] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => agotar(product)}
                      disabled={saving || product.stockActual <= 0}
                      className="min-h-9 rounded-lg border border-[#e4e7ec] px-3 py-1.5 text-xs font-semibold text-[#8a2c22] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Agotar
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleActivo(product)}
                      disabled={saving || (!product.activo && product.stockActual <= 0)}
                      className="min-h-9 rounded-lg border border-[#e4e7ec] px-3 py-1.5 text-xs font-semibold text-[#344054] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {product.activo ? "Pausar" : "Activar"}
                    </button>
                    {saving ? <span className="self-center text-xs text-[#98a2b3]">Guardando…</span> : null}
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 ? (
              <p className="col-span-full py-6 text-center text-sm text-[#667085]">
                Sin productos que coincidan con la búsqueda.
              </p>
            ) : null}
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-2xl border border-[#e4e7ec] bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-[#111318]">Acción masiva ({selectedIds.size} seleccionados)</h2>
        <div className="grid gap-3 sm:grid-cols-[auto_1fr_auto]">
          <select
            value={bulkAction}
            onChange={(event) => {
              setBulkAction(event.target.value as BulkActionChoice);
              setBulkPreview(null);
            }}
            className="rounded-xl border border-[#e4e7ec] bg-white px-3 py-2.5 text-sm text-[#344054]"
          >
            <option value="sumar">Sumar cantidad</option>
            <option value="restar">Restar cantidad</option>
            <option value="establecer">Establecer stock</option>
            <option value="activar">Activar</option>
            <option value="pausar">Pausar</option>
          </select>

          {bulkAction === "sumar" || bulkAction === "restar" || bulkAction === "establecer" ? (
            <input
              type="number"
              value={bulkValue}
              onChange={(event) => {
                setBulkValue(event.target.value);
                setBulkPreview(null);
              }}
              min={0}
              className="rounded-xl border border-[#e4e7ec] bg-white px-3 py-2.5 text-sm text-[#344054]"
            />
          ) : (
            <div />
          )}

          <button
            type="button"
            onClick={requestBulkPreview}
            disabled={selectedIds.size === 0 || bulkLoading}
            className="app-button-primary inline-flex min-h-11 items-center justify-center px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {bulkLoading ? "Calculando..." : "Vista previa"}
          </button>
        </div>

        {bulkPreview ? (
          <div className="space-y-3">
            {bulkPreview.erroresGlobales.length > 0 ? (
              <div className="space-y-1 rounded-xl border border-[#f3c6c0] bg-[#fdf1ef] px-4 py-3 text-sm text-[#8a2c22]">
                {bulkPreview.erroresGlobales.map((message, index) => (
                  <p key={index}>{message}</p>
                ))}
              </div>
            ) : null}

            {bulkPreview.productos.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-[#e4e7ec]">
                <table className="w-full min-w-[600px] text-left text-sm">
                  <thead className="bg-[#f7f8fa] text-xs font-semibold uppercase tracking-wide text-[#667085]">
                    <tr>
                      <th className="px-4 py-2.5">Producto</th>
                      <th className="px-4 py-2.5">Stock anterior</th>
                      <th className="px-4 py-2.5">Stock nuevo</th>
                      <th className="px-4 py-2.5">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#eef0f3]">
                    {bulkPreview.productos.map((row) => (
                      <tr key={row.id}>
                        <td className="px-4 py-2.5 text-[#111318]">{row.nombre}</td>
                        <td className="px-4 py-2.5 text-[#667085]">{row.stockAnterior}</td>
                        <td className="px-4 py-2.5 text-[#111318]">{row.stockNuevo}</td>
                        <td className="px-4 py-2.5 text-[#667085]">{row.activoNuevo ? "Activo" : "Pausado"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setBulkConfirmOpen(true)}
                disabled={bulkPreview.productos.length === 0 || bulkConfirming}
                className="app-button-primary inline-flex min-h-11 items-center justify-center px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              >
                {bulkConfirming ? "Aplicando..." : `Aplicar a ${bulkPreview.productos.length} productos`}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {bulkConfirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-[#111318]">Aplicar acción masiva</h3>
            <p className="mt-2 text-sm text-[#667085]">
              Esta acción actualizará {bulkPreview?.productos.length ?? 0} productos. ¿Confirmas?
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setBulkConfirmOpen(false)}
                className="rounded-xl border border-[#e4e7ec] px-4 py-2 text-sm font-semibold text-[#344054]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmBulk}
                className="app-button-primary rounded-xl px-4 py-2 text-sm font-semibold"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
