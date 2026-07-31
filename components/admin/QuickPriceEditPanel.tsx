"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Home, RotateCcw, Save, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { formatCurrency } from "@/lib/format";
import { getAvailableBrands, filterAndSortProducts } from "@/lib/catalog-search";
import { getMissingCatalogFields, describeMissingCatalogFields } from "@/lib/catalog-completeness";
import type { AdminProductRecord } from "@/lib/types";

type ModoFilter = "todos" | "AUTO" | "MANUAL";
type BulkOperationType = "recargo" | "ajuste-porcentaje" | "ajuste-monto" | "redondeo";

type BulkPreviewRow = {
  id: string;
  sku: string;
  nombre: string;
  precioAnterior: number;
  precioNuevo: number;
  diferencia: number;
};

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Ocurrió un error.");
  return data;
}

export function QuickPriceEditPanel() {
  const [products, setProducts] = useState<AdminProductRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [query, setQuery] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [modoFilter, setModoFilter] = useState<ModoFilter>("todos");

  // Ediciones pendientes: id -> nuevo precio (string, tal como lo escribe el admin)
  const [pendingEdits, setPendingEdits] = useState<Record<string, string>>({});
  const [savingRow, setSavingRow] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [confirmSaveAll, setConfirmSaveAll] = useState(false);

  // Edicion masiva
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOperation, setBulkOperation] = useState<BulkOperationType>("recargo");
  const [bulkValue, setBulkValue] = useState("35");
  const [bulkRoundingStep, setBulkRoundingStep] = useState<100 | 500 | 1000>(100);
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

    async function loadInitialProducts() {
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

    void loadInitialProducts();

    return () => {
      cancelled = true;
    };
  }, []);

  const brands = useMemo(() => getAvailableBrands(products), [products]);

  const filtered = useMemo(() => {
    let list = filterAndSortProducts(products, { query, brand: brandFilter, sort: "nombre-asc" });
    if (modoFilter !== "todos") {
      list = list.filter((p) => (p.modoPrecio ?? "AUTO") === modoFilter);
    }
    return list as AdminProductRecord[];
  }, [products, query, brandFilter, modoFilter]);

  function getDisplayPrice(product: AdminProductRecord): string {
    return pendingEdits[product.id] ?? String(product.precioVenta);
  }

  function isDirty(product: AdminProductRecord): boolean {
    const pending = pendingEdits[product.id];
    return pending !== undefined && pending !== String(product.precioVenta);
  }

  const dirtyCount = Object.keys(pendingEdits).filter((id) => {
    const product = products.find((p) => p.id === id);
    return product && isDirty(product);
  }).length;

  function handlePriceInputChange(productId: string, value: string) {
    setPendingEdits((prev) => ({ ...prev, [productId]: value }));
  }

  async function saveRow(product: AdminProductRecord) {
    const value = pendingEdits[product.id];
    if (value === undefined) return;

    setSavingRow(product.id);
    setError("");
    try {
      await fetchJson(`/api/admin/products/${product.id}/price`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "manual", precioVenta: Number(value) })
      });
      setPendingEdits((prev) => {
        const next = { ...prev };
        delete next[product.id];
        return next;
      });
      setNotice(`Precio de "${product.nombre}" actualizado.`);
      await loadProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible guardar el precio.");
    } finally {
      setSavingRow(null);
    }
  }

  async function saveAllPending() {
    setConfirmSaveAll(false);
    setSavingAll(true);
    setError("");
    const dirtyProducts = products.filter((p) => isDirty(p));
    let ok = 0;
    for (const product of dirtyProducts) {
      try {
        await fetchJson(`/api/admin/products/${product.id}/price`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "manual", precioVenta: Number(pendingEdits[product.id]) })
        });
        ok += 1;
      } catch {
        // continua con el resto; el error se reporta a nivel de resumen
      }
    }
    setPendingEdits({});
    setNotice(`${ok} de ${dirtyProducts.length} precios actualizados.`);
    setSavingAll(false);
    await loadProducts();
  }

  async function resetToAutomatic(product: AdminProductRecord) {
    setSavingRow(product.id);
    setError("");
    try {
      await fetchJson(`/api/admin/products/${product.id}/price`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "auto", recargoPorcentaje: 35 })
      });
      setNotice(`Precio de "${product.nombre}" recalculado automáticamente.`);
      await loadProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible recalcular el precio.");
    } finally {
      setSavingRow(null);
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

  function buildOperationPayload() {
    if (bulkOperation === "recargo") return { type: "recargo", porcentaje: Number(bulkValue) };
    if (bulkOperation === "ajuste-porcentaje") return { type: "ajuste-porcentaje", porcentaje: Number(bulkValue) };
    if (bulkOperation === "ajuste-monto") return { type: "ajuste-monto", monto: Number(bulkValue) };
    return { type: "redondeo", paso: bulkRoundingStep };
  }

  async function requestBulkPreview() {
    if (selectedIds.size === 0) {
      setError("Selecciona al menos un producto para el ajuste masivo.");
      return;
    }
    setBulkLoading(true);
    setError("");
    try {
      const data = await fetchJson("/api/admin/products/bulk-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "preview",
          productIds: [...selectedIds],
          operation: buildOperationPayload()
        })
      });
      setBulkPreview(data.preview);
      setBulkPreviewHash(data.previewHash);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible calcular el ajuste masivo.");
    } finally {
      setBulkLoading(false);
    }
  }

  async function confirmBulkAdjustment() {
    setBulkConfirmOpen(false);
    setBulkConfirming(true);
    setError("");
    try {
      const data = await fetchJson("/api/admin/products/bulk-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "confirm",
          productIds: [...selectedIds],
          operation: buildOperationPayload(),
          previewHash: bulkPreviewHash
        })
      });
      setNotice(`Ajuste masivo aplicado: ${data.actualizados} productos actualizados.`);
      setBulkPreview(null);
      setBulkPreviewHash("");
      setSelectedIds(new Set());
      await loadProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible aplicar el ajuste masivo.");
    } finally {
      setBulkConfirming(false);
    }
  }

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
              <h1 className="text-3xl font-bold tracking-[-0.04em] text-white sm:text-4xl">
                Edición rápida de precios
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-white/60 sm:text-base">
                Ajusta precios sin abrir cada producto. No modifica stock, imágenes, Top 12 ni ofertas.
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
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
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
          <select
            value={modoFilter}
            onChange={(event) => setModoFilter(event.target.value as ModoFilter)}
            aria-label="Filtrar por modo de precio"
            className="rounded-xl border border-[#e4e7ec] bg-white px-3 py-2.5 text-sm text-[#344054]"
          >
            <option value="todos">Automático y manual</option>
            <option value="AUTO">Solo automático</option>
            <option value="MANUAL">Solo manual</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-[#667085]">
            {dirtyCount > 0 ? `${dirtyCount} cambio(s) pendiente(s)` : "Sin cambios pendientes"}
          </span>
          <button
            type="button"
            onClick={() => setConfirmSaveAll(true)}
            disabled={dirtyCount === 0 || savingAll}
            className="app-button-primary inline-flex min-h-11 items-center gap-2 px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {savingAll ? "Guardando..." : "Guardar todos los cambios"}
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-[#667085]">Cargando catálogo...</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[#e4e7ec]">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-[#f7f8fa] text-xs font-semibold uppercase tracking-wide text-[#667085]">
                <tr>
                  <th className="px-3 py-3">
                    <span className="sr-only">Seleccionar</span>
                  </th>
                  <th className="px-3 py-3">SKU</th>
                  <th className="px-3 py-3">Nombre</th>
                  <th className="px-3 py-3">Marca</th>
                  <th className="px-3 py-3">Costo</th>
                  <th className="px-3 py-3">Precio de venta</th>
                  <th className="px-3 py-3">Utilidad</th>
                  <th className="px-3 py-3">Recargo efectivo</th>
                  <th className="px-3 py-3">Modo</th>
                  <th className="px-3 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eef0f3]">
                {filtered.map((product) => {
                  const displayPrice = getDisplayPrice(product);
                  const dirty = isDirty(product);
                  const numericPrice = Number(displayPrice);
                  const costo = product.costoUnitario ?? 0;
                  const utilidad = Number.isFinite(numericPrice) ? numericPrice - costo : 0;
                  const recargoEfectivo =
                    costo > 0 && Number.isFinite(numericPrice) ? ((numericPrice - costo) / costo) * 100 : null;
                  const modo = product.modoPrecio ?? "AUTO";
                  const missingFields = getMissingCatalogFields(product);

                  return (
                    <tr key={product.id} className={dirty ? "bg-[#fff8ec]" : undefined}>
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(product.id)}
                          onChange={() => toggleSelected(product.id)}
                          aria-label={`Seleccionar ${product.nombre}`}
                        />
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-[#344054]">{product.sku}</td>
                      <td className="px-3 py-2.5 text-[#111318]">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span>{product.nombre}</span>
                          {missingFields.length > 0 ? (
                            <span
                              title={describeMissingCatalogFields(missingFields)}
                              className="inline-flex shrink-0 rounded-full bg-[#fff8ec] px-2 py-0.5 text-[10px] font-semibold text-[#8a5a00]"
                            >
                              Ficha incompleta
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-[#667085]">{product.marca}</td>
                      <td className="px-3 py-2.5 text-[#667085]">{formatCurrency(costo)}</td>
                      <td className="px-3 py-2.5">
                        <input
                          type="number"
                          min={1}
                          value={displayPrice}
                          onChange={(event) => handlePriceInputChange(product.id, event.target.value)}
                          className="w-28 rounded-lg border border-[#e4e7ec] px-2 py-1.5 text-sm"
                        />
                      </td>
                      <td className="px-3 py-2.5 text-[#667085]">{formatCurrency(utilidad)}</td>
                      <td className="px-3 py-2.5 text-[#667085]">
                        {recargoEfectivo !== null ? `${recargoEfectivo.toFixed(1)}%` : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            modo === "MANUAL" ? "bg-[#fff3c4] text-[#8a5a00]" : "bg-[#eeebff] text-[#5434e6]"
                          }`}
                        >
                          {modo}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => saveRow(product)}
                            disabled={!dirty || savingRow === product.id}
                            className="rounded-lg border border-[#e4e7ec] px-2.5 py-1.5 text-xs font-semibold text-[#5434e6] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Guardar
                          </button>
                          {modo === "MANUAL" ? (
                            <button
                              type="button"
                              onClick={() => resetToAutomatic(product)}
                              disabled={savingRow === product.id}
                              title="Volver a precio automático"
                              className="inline-flex items-center gap-1 rounded-lg border border-[#e4e7ec] px-2.5 py-1.5 text-xs font-semibold text-[#667085] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <RotateCcw className="h-3 w-3" />
                              Auto
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-3 py-6 text-center text-sm text-[#667085]">
                      Sin productos que coincidan con la búsqueda.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-2xl border border-[#e4e7ec] bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-[#111318]">Edición masiva ({selectedIds.size} seleccionados)</h2>
        <div className="grid gap-3 sm:grid-cols-[auto_1fr_auto]">
          <select
            value={bulkOperation}
            onChange={(event) => {
              setBulkOperation(event.target.value as BulkOperationType);
              setBulkPreview(null);
            }}
            className="rounded-xl border border-[#e4e7ec] bg-white px-3 py-2.5 text-sm text-[#344054]"
          >
            <option value="recargo">Aplicar recargo sobre costo (%)</option>
            <option value="ajuste-porcentaje">Ajustar precio por porcentaje (%)</option>
            <option value="ajuste-monto">Ajustar precio por monto fijo ($)</option>
            <option value="redondeo">Redondear precio final</option>
          </select>

          {bulkOperation === "redondeo" ? (
            <select
              value={bulkRoundingStep}
              onChange={(event) => {
                setBulkRoundingStep(Number(event.target.value) as 100 | 500 | 1000);
                setBulkPreview(null);
              }}
              className="rounded-xl border border-[#e4e7ec] bg-white px-3 py-2.5 text-sm text-[#344054]"
            >
              <option value={100}>Redondear a $100</option>
              <option value={500}>Redondear a $500</option>
              <option value={1000}>Redondear a $1.000</option>
            </select>
          ) : (
            <input
              type="number"
              value={bulkValue}
              onChange={(event) => {
                setBulkValue(event.target.value);
                setBulkPreview(null);
              }}
              placeholder={bulkOperation === "ajuste-monto" ? "Monto en $ (puede ser negativo)" : "Porcentaje (puede ser negativo)"}
              className="rounded-xl border border-[#e4e7ec] bg-white px-3 py-2.5 text-sm text-[#344054]"
            />
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
                      <th className="px-4 py-2.5">Precio anterior</th>
                      <th className="px-4 py-2.5">Precio nuevo</th>
                      <th className="px-4 py-2.5">Diferencia</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#eef0f3]">
                    {bulkPreview.productos.map((row) => (
                      <tr key={row.id}>
                        <td className="px-4 py-2.5 text-[#111318]">{row.nombre}</td>
                        <td className="px-4 py-2.5 text-[#667085]">{formatCurrency(row.precioAnterior)}</td>
                        <td className="px-4 py-2.5 text-[#111318]">{formatCurrency(row.precioNuevo)}</td>
                        <td className={`px-4 py-2.5 ${row.diferencia >= 0 ? "text-[#1f6d33]" : "text-[#8a2c22]"}`}>
                          {row.diferencia >= 0 ? "+" : ""}
                          {formatCurrency(row.diferencia)}
                        </td>
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
                disabled={bulkPreview.productos.length === 0 || bulkPreview.erroresGlobales.length > 0 || bulkConfirming}
                className="app-button-primary inline-flex min-h-11 items-center justify-center px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              >
                {bulkConfirming ? "Aplicando..." : `Aplicar a ${bulkPreview.productos.length} productos`}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {confirmSaveAll ? (
        <ConfirmDialog
          title="Guardar todos los cambios"
          message={`Se guardarán ${dirtyCount} precio(s) modificado(s). ¿Confirmas?`}
          onCancel={() => setConfirmSaveAll(false)}
          onConfirm={saveAllPending}
        />
      ) : null}

      {bulkConfirmOpen ? (
        <ConfirmDialog
          title="Aplicar ajuste masivo"
          message={`Esta acción actualizará el precio de ${bulkPreview?.productos.length ?? 0} productos. ¿Confirmas?`}
          onCancel={() => setBulkConfirmOpen(false)}
          onConfirm={confirmBulkAdjustment}
        />
      ) : null}
    </main>
  );
}

function ConfirmDialog({
  title,
  message,
  onConfirm,
  onCancel
}: {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-[#111318]">{title}</h3>
        <p className="mt-2 text-sm text-[#667085]">{message}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-[#e4e7ec] px-4 py-2 text-sm font-semibold text-[#344054]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="app-button-primary rounded-xl px-4 py-2 text-sm font-semibold"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
