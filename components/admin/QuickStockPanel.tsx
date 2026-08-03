"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Home,
  Minus,
  Plus,
  ShoppingBag,
  X
} from "lucide-react";
import Link from "next/link";
import { getAvailableBrands, filterAndSortProducts } from "@/lib/catalog-search";
import {
  selectIds,
  clearSelection,
  toggleId,
  countVisibleSelected,
  isEntireCatalogSelected,
  getMasterCheckboxState
} from "@/lib/bulk-selection";
import { LoadingOverlay } from "@/components/shared/LoadingOverlay";
import { AppToast } from "@/components/shared/AppToast";
import { getMissingCatalogFields, describeMissingCatalogFields } from "@/lib/catalog-completeness";
import type { AdminProductRecord } from "@/lib/types";
import type { BulkStockOperation, BulkStockPreview, BulkStockConfirmResult } from "@/services/productoService";

type QuickFilter = "todos" | "sin-stock" | "stock-uno" | "activos" | "pausados";
type BulkActionChoice = "sumar" | "restar" | "establecer" | "activar" | "pausar" | "disponibleUno" | "agotar";

const PAGE_SIZE = 30;

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Ocurrió un error.");
  return data;
}

function buildBulkOperation(action: BulkActionChoice, value: string): BulkStockOperation {
  if (action === "sumar") return { type: "sumar", cantidad: Number(value) };
  if (action === "restar") return { type: "restar", cantidad: Number(value) };
  if (action === "establecer") return { type: "establecer", valor: Number(value) };
  if (action === "activar") return { type: "activar" };
  if (action === "pausar") return { type: "pausar" };
  if (action === "disponibleUno") return { type: "disponibleUno" };
  return { type: "agotar" };
}

const ACTION_LABELS: Record<BulkActionChoice, string> = {
  sumar: "Sumar cantidad",
  restar: "Restar cantidad",
  establecer: "Establecer stock total",
  activar: "Activar",
  pausar: "Pausar",
  disponibleUno: "Dejar 1 disponible",
  agotar: "Agotar disponibilidad"
};

function actionTitle(action: BulkActionChoice, count: number): string {
  const plural = count === 1 ? "producto" : "productos";
  if (action === "activar") return `Activar ${count} ${plural}`;
  if (action === "pausar") return `Pausar ${count} ${plural}`;
  if (action === "disponibleUno") return `Dejar 1 disponible en ${count} ${plural}`;
  if (action === "agotar") return `Agotar disponibilidad en ${count} ${plural}`;
  if (action === "sumar") return `Sumar cantidad en ${count} ${plural}`;
  if (action === "restar") return `Restar cantidad en ${count} ${plural}`;
  return `Establecer stock total en ${count} ${plural}`;
}

/** Mensaje del overlay de carga mientras se aplica la accion (seccion 3, Fase 2B.11): comunica claramente que se esta procesando, para que nunca parezca que la app se colgo. */
function bulkProgressMessage(action: BulkActionChoice): string {
  if (action === "activar") return "Activando productos…";
  if (action === "pausar") return "Pausando productos…";
  if (action === "disponibleUno" || action === "agotar") return "Actualizando disponibilidad…";
  if (action === "sumar" || action === "restar" || action === "establecer") return "Actualizando stock…";
  return "Aplicando cambios masivos…";
}

/** Traduce el valor amigable de la URL (?stock=agotado) al id interno del filtro rapido. */
function mapUrlStockToQuickFilter(stock?: string): QuickFilter {
  switch (stock) {
    case "agotado":
      return "sin-stock";
    case "uno":
      return "stock-uno";
    case "activos":
    case "pausados":
      return stock;
    default:
      return "todos";
  }
}

function actionConsequence(action: BulkActionChoice): string {
  if (action === "activar") {
    return "Los productos quedarán activos. Los que no tengan stock seguirán sin aparecer en el catálogo público.";
  }
  if (action === "pausar") {
    return "Estos productos dejarán de aparecer en el catálogo público. El stock, precios, historial y reservas se conservarán.";
  }
  if (action === "disponibleUno") {
    return "Cada producto quedará con una unidad disponible además de sus reservas existentes.";
  }
  if (action === "agotar") {
    return "El stock total quedará igual al stock reservado de cada producto (disponible real: 0). Nunca queda por debajo de lo reservado.";
  }
  return "El stock total se recalcula respetando siempre el stock reservado de cada producto.";
}

type QuickStockPanelProps = {
  /** True dentro del shell de /admin/catalogo/stock (Fase 3A): encabezado compacto, sin buscador propio duplicado. */
  embedded?: boolean;
  /** Termino de busqueda inicial (sincronizado con `?q=` del shell cuando embedded=true). */
  initialSearch?: string;
  /** Filtro inicial (valor amigable de `?stock=`, ver mapUrlStockToQuickFilter). */
  initialFilter?: string;
};

export function QuickStockPanel({ embedded = false, initialSearch = "", initialFilter }: QuickStockPanelProps = {}) {
  const [products, setProducts] = useState<AdminProductRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [query, setQuery] = useState(initialSearch);
  const [brandFilter, setBrandFilter] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>(() => mapUrlStockToQuickFilter(initialFilter));
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Sincroniza `query` cuando `initialSearch` cambia (el buscador comun del
  // shell actualiza `?q=` sin desmontar esta pagina). `query` sigue siendo
  // editable de forma independiente despues del primer render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuery(initialSearch);
    setVisibleCount(PAGE_SIZE);
  }, [initialSearch]);

  const [savingId, setSavingId] = useState<string | null>(null);
  const [stockDrafts, setStockDrafts] = useState<Record<string, string>>({});

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<BulkActionChoice>("activar");
  const [bulkValue, setBulkValue] = useState("1");
  const [bulkPreview, setBulkPreview] = useState<BulkStockPreview | null>(null);
  const [bulkPreviewHash, setBulkPreviewHash] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkConfirming, setBulkConfirming] = useState(false);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [pauseAllAck, setPauseAllAck] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkStockConfirmResult | null>(null);
  const [bulkError, setBulkError] = useState("");
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);

  const openerButtonRef = useRef<HTMLButtonElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const masterCheckboxRef = useRef<HTMLInputElement | null>(null);

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

  useEffect(() => {
    if (bulkConfirmOpen) {
      modalRef.current?.focus();
    }
  }, [bulkConfirmOpen]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function showToast(message: string, tone: "success" | "error") {
    setToast({ message, tone });
  }

  const brands = useMemo(() => getAvailableBrands(products), [products]);

  const filtered = useMemo(() => {
    let list = filterAndSortProducts(products, { query, brand: brandFilter, sort: "nombre-asc" }) as AdminProductRecord[];
    if (quickFilter === "sin-stock") list = list.filter((p) => p.stockActual <= 0);
    if (quickFilter === "stock-uno") list = list.filter((p) => p.stockActual === 1);
    if (quickFilter === "activos") list = list.filter((p) => p.activo);
    if (quickFilter === "pausados") list = list.filter((p) => !p.activo);
    return list;
  }, [products, query, brandFilter, quickFilter]);

  const visibleProducts = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  const allIds = useMemo(() => products.map((p) => p.id), [products]);
  const filteredIds = useMemo(() => filtered.map((p) => p.id), [filtered]);
  const visibleIds = useMemo(() => visibleProducts.map((p) => p.id), [visibleProducts]);
  const visibleSelectedCount = countVisibleSelected(selectedIds, visibleIds);
  const isWholeCatalogSelected = isEntireCatalogSelected(selectedIds, allIds);
  const masterCheckboxState = getMasterCheckboxState(selectedIds, allIds);
  const isPartialSelection = masterCheckboxState === "indeterminate";
  const hasActiveFilter = query.trim() !== "" || brandFilter !== "" || quickFilter !== "todos";

  useEffect(() => {
    if (masterCheckboxRef.current) {
      masterCheckboxRef.current.indeterminate = isPartialSelection;
    }
  }, [isPartialSelection]);

  function handleMasterCheckboxChange(checked: boolean) {
    if (checked) {
      handleSelectAll();
    } else {
      handleClearSelection();
    }
  }

  function resetFilters(patch: Partial<{ query: string; brandFilter: string; quickFilter: QuickFilter }>) {
    if (patch.query !== undefined) setQuery(patch.query);
    if (patch.brandFilter !== undefined) setBrandFilter(patch.brandFilter);
    if (patch.quickFilter !== undefined) setQuickFilter(patch.quickFilter);
    setVisibleCount(PAGE_SIZE);
  }

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
    setSelectedIds((prev) => toggleId(prev, id));
    setBulkPreview(null);
  }

  function handleSelectVisible() {
    setSelectedIds((prev) => selectIds(prev, visibleIds));
    setBulkPreview(null);
  }

  function handleSelectFiltered() {
    setSelectedIds((prev) => selectIds(prev, filteredIds));
    setBulkPreview(null);
  }

  function handleSelectAll() {
    setSelectedIds((prev) => selectIds(prev, allIds));
    setBulkPreview(null);
  }

  function handleClearSelection() {
    setSelectedIds(clearSelection());
    setBulkPreview(null);
  }

  function chooseQuickAction(action: "activar" | "pausar" | "disponibleUno") {
    setBulkAction(action);
    setBulkPreview(null);
    void requestBulkPreview(action);
  }

  async function requestBulkPreview(actionOverride?: BulkActionChoice) {
    const action = actionOverride ?? bulkAction;
    if (selectedIds.size === 0) {
      setBulkError("Selecciona al menos un producto para la acción masiva.");
      return;
    }
    setBulkLoading(true);
    setBulkError("");
    try {
      const data = await fetchJson("/api/admin/products/bulk-stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "preview",
          productIds: [...selectedIds],
          operation: buildBulkOperation(action, bulkValue)
        })
      });
      setBulkPreview(data.preview);
      setBulkPreviewHash(data.previewHash);
      setPauseAllAck(false);
      setBulkConfirmOpen(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "No fue posible calcular la acción masiva.";
      setBulkError(message);
      showToast(message, "error");
    } finally {
      setBulkLoading(false);
    }
  }

  function closeConfirmModal() {
    if (bulkConfirming) return; // Escape/cerrar solo antes de comenzar la operacion
    setBulkConfirmOpen(false);
    openerButtonRef.current?.focus();
  }

  async function confirmBulk() {
    setBulkConfirming(true);
    setBulkError("");
    try {
      const data = await fetchJson("/api/admin/products/bulk-stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "confirm",
          productIds: [...selectedIds],
          operation: buildBulkOperation(bulkAction, bulkValue),
          previewHash: bulkPreviewHash
        })
      });
      setBulkResult({
        actualizados: data.actualizados,
        sinCambios: data.sinCambios,
        bloqueados: data.bloqueados,
        total: data.total
      });
      setBulkConfirmOpen(false);
      setBulkPreview(null);
      setBulkPreviewHash("");
      showToast(
        `${data.actualizados} producto(s) actualizados${data.bloqueados > 0 ? ` · ${data.bloqueados} bloqueados` : ""}.`,
        "success"
      );
      await loadProducts();
    } catch (err) {
      // No se limpia la seleccion: se puede reintentar sin repetir la eleccion.
      const message = err instanceof Error ? err.message : "No fue posible aplicar la acción masiva.";
      setBulkError(message);
      showToast(message, "error");
    } finally {
      setBulkConfirming(false);
    }
  }

  function keepSelectionAfterResult() {
    setBulkResult(null);
  }

  function clearSelectionAfterResult() {
    setSelectedIds(clearSelection());
    setBulkResult(null);
  }

  const quickFilters: Array<{ id: QuickFilter; label: string }> = [
    { id: "todos", label: "Todos" },
    { id: "sin-stock", label: "Solo sin stock" },
    { id: "stock-uno", label: "Solo stock 1" },
    { id: "activos", label: "Solo activos" },
    { id: "pausados", label: "Solo pausados" }
  ];

  const requiresPauseAllAck = bulkAction === "pausar" && isWholeCatalogSelected;
  const canConfirmBulk =
    !!bulkPreview &&
    bulkPreview.productos.some((p) => p.status !== "BLOQUEADO") &&
    !bulkConfirming &&
    (!requiresPauseAllAck || pauseAllAck);

  const previewCambian = bulkPreview?.productos.filter((p) => p.status === "CAMBIA").length ?? 0;
  const previewSinCambios = bulkPreview?.productos.filter((p) => p.status === "SIN_CAMBIOS").length ?? 0;
  const previewBloqueados = bulkPreview?.productos.filter((p) => p.status === "BLOQUEADO").length ?? 0;

  return (
    <main
      className={
        embedded
          ? "flex w-full min-w-0 max-w-full flex-col gap-6 overflow-x-hidden pb-[calc(88px+env(safe-area-inset-bottom))]"
          : "mx-auto flex min-h-[100dvh] w-full max-w-[1400px] flex-col gap-6 overflow-x-hidden bg-[#f7f8fa] px-4 py-4 pb-[calc(88px+env(safe-area-inset-bottom))] sm:px-6 lg:px-8"
      }
    >
      {toast ? (
        <AppToast message={toast.message} tone={toast.tone} onClose={() => setToast(null)} />
      ) : null}

      {/* Overlay de carga centrado (seccion 3, Fase 2B.11): visible durante TODO el */}
      {/* tiempo de espera real (calculo del preview y aplicacion confirmada), para */}
      {/* que nunca de la sensacion de que la app se colgo. Bloquea interaccion al */}
      {/* cubrir toda la pantalla (fixed inset-0), sin depender del scroll actual. */}
      {bulkLoading ? (
        <LoadingOverlay
          message="Calculando cambios masivos…"
          subMessage={`Revisando ${selectedIds.size} producto(s) seleccionados.`}
        />
      ) : null}
      {bulkConfirming ? (
        <LoadingOverlay
          message={bulkProgressMessage(bulkAction)}
          subMessage={`Actualizando ${bulkPreview?.totalSeleccionados ?? selectedIds.size} producto(s). No cierres esta pantalla.`}
        />
      ) : null}

      {!embedded ? (
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
      ) : null}

      {error ? (
        <div className="flex items-start gap-2 rounded-xl border border-[#f3c6c0] bg-[#fdf1ef] px-4 py-3 text-sm text-[#8a2c22]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}
      <section className="space-y-4 rounded-2xl border border-[#e4e7ec] bg-white p-5 shadow-sm sm:p-6">
        <div className={embedded ? "grid gap-3" : "grid gap-3 sm:grid-cols-[1fr_auto]"}>
          {!embedded ? (
            <input
              type="search"
              value={query}
              onChange={(event) => resetFilters({ query: event.target.value })}
              placeholder="Buscar por nombre, marca o SKU"
              aria-label="Buscar productos"
              className="rounded-xl border border-[#e4e7ec] bg-white px-3 py-2.5 text-sm text-[#344054]"
            />
          ) : null}
          <select
            value={brandFilter}
            onChange={(event) => resetFilters({ brandFilter: event.target.value })}
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
              onClick={() => resetFilters({ quickFilter: filterOption.id })}
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

        {/* Checkbox maestro siempre visible (seccion 3-5): selecciona TODO el catalogo con un toque, */}
        {/* sin depender de filtros, scroll ni de encontrar un boton perdido entre otros controles. */}
        {/* No sticky cuando embedded=true: el shell de /admin/catalogo ya tiene su propia */}
        {/* navegacion sticky (z-10) y apilar dos barras "top-0" pelearia por el mismo espacio. */}
        <div
          className={`space-y-2 rounded-xl border border-[#d8cdfe] bg-[#f5f2ff] px-4 py-3 shadow-sm ${
            embedded ? "" : "sticky top-0 z-20"
          }`}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex min-h-11 w-fit cursor-pointer items-center gap-3 rounded-xl border-2 border-[#7357ff] bg-white px-3.5 py-2 shadow-sm">
              <input
                ref={masterCheckboxRef}
                type="checkbox"
                checked={isWholeCatalogSelected}
                onChange={(event) => handleMasterCheckboxChange(event.target.checked)}
                aria-label="Seleccionar todos los productos del catálogo"
                className="h-5 w-5 accent-[#7357ff]"
              />
              <span className="text-sm font-bold text-[#392694]">
                <span className="hidden sm:inline">Seleccionar todo el catálogo</span>
                <span className="sm:hidden">Todo el catálogo</span>
                {" · "}
                {allIds.length} producto{allIds.length === 1 ? "" : "s"}
              </span>
            </label>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
              <span className="font-semibold text-[#344054]" aria-live="polite">
                {selectedIds.size} seleccionado(s) · {visibleSelectedCount} visibles
              </span>
              <button
                type="button"
                onClick={handleSelectFiltered}
                className="min-h-9 rounded-lg border border-[#d8cdfe] bg-white px-3 py-1.5 font-semibold text-[#5434e6]"
              >
                Seleccionar resultados{hasActiveFilter ? `: ${filtered.length}` : ""}
              </button>
              <button
                type="button"
                onClick={handleSelectVisible}
                className="font-semibold text-[#667085] underline decoration-dotted underline-offset-2"
              >
                Seleccionar visibles
              </button>
              <button
                type="button"
                onClick={handleClearSelection}
                disabled={selectedIds.size === 0}
                className="min-h-9 rounded-lg border border-[#e4e7ec] bg-white px-3 py-1.5 font-semibold text-[#8a2c22] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Limpiar
              </button>
            </div>
          </div>
        </div>

        <p className="text-sm font-medium text-[#344054]" aria-live="polite">
          {loading ? "Cargando catálogo…" : `${filtered.length} producto(s) encontrado(s)`}
        </p>

        {loading ? (
          /* Skeleton con la misma grilla y alturas que las tarjetas finales (evita el salto de */
          /* diseño al reemplazar "Cargando..." por el listado real, ver seccion 7 del encargo). */
          <div aria-busy="true" aria-live="polite" role="status" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <span className="sr-only">Cargando catálogo…</span>
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="flex flex-col gap-3 rounded-2xl border border-[#e4e7ec] bg-white p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="mt-1 h-5 w-5 shrink-0 animate-pulse rounded bg-[#e4e7ec]" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-3 w-16 animate-pulse rounded bg-[#e4e7ec]" />
                    <div className="h-4 w-3/4 animate-pulse rounded bg-[#e4e7ec]" />
                    <div className="h-3 w-1/2 animate-pulse rounded bg-[#f2f4f7]" />
                  </div>
                  <div className="h-5 w-14 shrink-0 animate-pulse rounded-full bg-[#f2f4f7]" />
                </div>
                <div className="h-5 w-24 animate-pulse rounded-full bg-[#f2f4f7]" />
                <div className="flex items-center gap-2">
                  <div className="h-11 w-11 animate-pulse rounded-xl bg-[#f2f4f7]" />
                  <div className="h-11 w-20 animate-pulse rounded-xl bg-[#f2f4f7]" />
                  <div className="h-11 w-11 animate-pulse rounded-xl bg-[#f2f4f7]" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visibleProducts.map((product) => {
                const saving = savingId === product.id;
                const disponible = product.stockActual - (product.stockReservado ?? 0);
                const etiqueta = `${product.nombre}${product.contenido ? ` ${product.contenido}` : ""}`;
                const missingFields = getMissingCatalogFields(product);

                return (
                  <div key={product.id} className="flex flex-col gap-3 rounded-2xl border border-[#e4e7ec] bg-white p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(product.id)}
                        onChange={() => toggleSelected(product.id)}
                        aria-label={`Seleccionar ${etiqueta}`}
                        className="mt-1 h-5 w-5"
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
                      {missingFields.length > 0 ? (
                        <span
                          title={describeMissingCatalogFields(missingFields)}
                          className="rounded-full bg-[#fff8ec] px-2 py-0.5 font-semibold text-[#8a5a00]"
                        >
                          Ficha incompleta
                        </span>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => decrement(product)}
                        disabled={saving || product.stockActual <= 0}
                        aria-label={`Restar stock a ${etiqueta}`}
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
                        aria-label={`Stock de ${etiqueta}`}
                        className="h-11 w-20 rounded-xl border border-[#e4e7ec] px-2 text-center text-sm font-semibold"
                      />
                      <button
                        type="button"
                        onClick={() => increment(product)}
                        disabled={saving}
                        aria-label={`Sumar stock a ${etiqueta}`}
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
            {hasMore ? (
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                  className="min-h-11 rounded-xl border border-[#e4e7ec] bg-white px-5 py-2.5 text-sm font-semibold text-[#5434e6] shadow-sm"
                >
                  Cargar más productos
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>

      {/* Acciones rapidas destacadas (seccion 6) + selector completo (seccion 5) */}
      <section className="space-y-4 rounded-2xl border border-[#e4e7ec] bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-[#111318]">Acciones sobre la selección</h2>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => chooseQuickAction("activar")}
            disabled={selectedIds.size === 0 || bulkLoading}
            className="min-h-11 rounded-xl border border-[#bfe6c6] bg-[#eefbf1] px-4 py-2.5 text-sm font-semibold text-[#1f6d33] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Activar seleccionados
          </button>
          <button
            type="button"
            onClick={() => chooseQuickAction("pausar")}
            disabled={selectedIds.size === 0 || bulkLoading}
            className="min-h-11 rounded-xl border border-[#e4e7ec] bg-[#f2f4f7] px-4 py-2.5 text-sm font-semibold text-[#475467] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Pausar seleccionados
          </button>
          <button
            type="button"
            onClick={() => chooseQuickAction("disponibleUno")}
            disabled={selectedIds.size === 0 || bulkLoading}
            className="min-h-11 rounded-xl border border-[#d8cdfe] bg-[#f5f2ff] px-4 py-2.5 text-sm font-semibold text-[#5434e6] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Dejar stock disponible en 1
          </button>
        </div>

        <details className="rounded-xl border border-[#e4e7ec] p-3">
          <summary className="cursor-pointer text-sm font-semibold text-[#344054]">Más acciones</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-[auto_1fr_auto]">
            <select
              value={bulkAction}
              onChange={(event) => {
                setBulkAction(event.target.value as BulkActionChoice);
                setBulkPreview(null);
              }}
              aria-label="Elegir acción masiva"
              className="rounded-xl border border-[#e4e7ec] bg-white px-3 py-2.5 text-sm text-[#344054]"
            >
              {(Object.keys(ACTION_LABELS) as BulkActionChoice[]).map((action) => (
                <option key={action} value={action}>
                  {ACTION_LABELS[action]}
                </option>
              ))}
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
                aria-label="Valor de la acción masiva"
                className="rounded-xl border border-[#e4e7ec] bg-white px-3 py-2.5 text-sm text-[#344054]"
              />
            ) : (
              <div />
            )}

            <button
              type="button"
              ref={openerButtonRef}
              onClick={() => requestBulkPreview()}
              disabled={selectedIds.size === 0 || bulkLoading}
              className="app-button-primary inline-flex min-h-11 items-center justify-center px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            >
              {bulkLoading ? "Calculando..." : "Vista previa"}
            </button>
          </div>
        </details>

        {bulkError && !bulkConfirmOpen ? (
          <div className="flex items-start gap-2 rounded-xl border border-[#f3c6c0] bg-[#fdf1ef] px-4 py-3 text-sm text-[#8a2c22]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{bulkError}</span>
          </div>
        ) : null}
      </section>

      {/* Barra sticky de accion masiva (movil), seccion 5 */}
      {selectedIds.size > 0 && !bulkConfirmOpen && !bulkResult ? (
        <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t border-[#e4e7ec] bg-white px-3 py-2 shadow-[0_-4px_12px_rgba(17,19,24,0.08)] sm:hidden">
          <span className="text-xs font-semibold text-[#344054]" aria-live="polite">
            {selectedIds.size} seleccionado(s)
          </span>
          <button
            type="button"
            onClick={() => chooseQuickAction("activar")}
            className="min-h-11 flex-1 rounded-lg bg-[#eefbf1] px-2 text-xs font-semibold text-[#1f6d33]"
          >
            Activar
          </button>
          <button
            type="button"
            onClick={() => chooseQuickAction("pausar")}
            className="min-h-11 flex-1 rounded-lg bg-[#f2f4f7] px-2 text-xs font-semibold text-[#475467]"
          >
            Pausar
          </button>
          <button
            type="button"
            onClick={handleClearSelection}
            aria-label="Limpiar selección"
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-[#e4e7ec]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}
      {selectedIds.size > 0 && !bulkConfirmOpen && !bulkResult ? <div className="h-16 sm:hidden" aria-hidden="true" /> : null}

      {/* Vista previa obligatoria (seccion 7-8) */}
      {bulkConfirmOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onKeyDown={(event) => {
            if (event.key === "Escape") closeConfirmModal();
          }}
        >
          <div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-preview-title"
            tabIndex={-1}
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
          >
            <h3 id="bulk-preview-title" className="text-lg font-semibold text-[#111318]">
              {actionTitle(bulkAction, bulkPreview?.totalSeleccionados ?? selectedIds.size)}
            </h3>
            <p className="mt-2 text-sm text-[#667085]">{actionConsequence(bulkAction)}</p>

            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg bg-[#eeebff] px-2 py-2">
                <div className="font-bold text-[#5434e6]">{previewCambian}</div>
                <div className="text-[#5434e6]">cambiarán</div>
              </div>
              <div className="rounded-lg bg-[#f2f4f7] px-2 py-2">
                <div className="font-bold text-[#475467]">{previewSinCambios}</div>
                <div className="text-[#475467]">ya cumplen</div>
              </div>
              <div className="rounded-lg bg-[#fdf1ef] px-2 py-2">
                <div className="font-bold text-[#8a2c22]">{previewBloqueados}</div>
                <div className="text-[#8a2c22]">bloqueados</div>
              </div>
            </div>

            {previewBloqueados > 0 ? (
              <ul className="mt-3 max-h-32 space-y-1 overflow-y-auto rounded-lg border border-[#f3c6c0] bg-[#fdf1ef] p-3 text-xs text-[#8a2c22]">
                {bulkPreview?.productos
                  .filter((p) => p.status === "BLOQUEADO")
                  .map((p) => (
                    <li key={p.id}>
                      {p.nombre}: {p.motivo}
                    </li>
                  ))}
              </ul>
            ) : null}

            {requiresPauseAllAck ? (
              <div className="mt-4 space-y-2 rounded-lg border border-[#f3c6c0] bg-[#fdf1ef] p-3">
                <p className="text-sm font-semibold text-[#8a2c22]">Estás por pausar todo el catálogo.</p>
                <label className="flex items-start gap-2 text-xs text-[#8a2c22]">
                  <input
                    type="checkbox"
                    checked={pauseAllAck}
                    onChange={(event) => setPauseAllAck(event.target.checked)}
                    className="mt-0.5 h-4 w-4"
                  />
                  Entiendo que ningún perfume activo aparecerá públicamente.
                </label>
              </div>
            ) : null}

            {bulkError ? (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-[#f3c6c0] bg-[#fdf1ef] px-3 py-2 text-xs text-[#8a2c22]">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{bulkError}</span>
              </div>
            ) : null}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeConfirmModal}
                disabled={bulkConfirming}
                className="rounded-xl border border-[#e4e7ec] px-4 py-2 text-sm font-semibold text-[#344054] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmBulk}
                disabled={!canConfirmBulk}
                className="app-button-primary inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              >
                {bulkConfirming ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
                ) : null}
                Confirmar acción
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Resultado final (seccion 10) */}
      {bulkResult ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div role="dialog" aria-modal="true" aria-labelledby="bulk-result-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-[#1f6d33]" />
              <h3 id="bulk-result-title" className="text-lg font-semibold text-[#111318]">
                Acción completada
              </h3>
            </div>
            <div className="mt-4 space-y-1 text-sm text-[#344054]" aria-live="polite">
              <p>{bulkResult.total} seleccionados</p>
              <p>{bulkResult.actualizados} modificados</p>
              <p>{bulkResult.sinCambios} ya estaban en ese estado</p>
              <p>{bulkResult.bloqueados} bloqueados</p>
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={keepSelectionAfterResult}
                className="rounded-xl border border-[#e4e7ec] px-4 py-2 text-sm font-semibold text-[#344054]"
              >
                Mantener selección
              </button>
              <button
                type="button"
                onClick={clearSelectionAfterResult}
                className="rounded-xl border border-[#e4e7ec] px-4 py-2 text-sm font-semibold text-[#344054]"
              >
                Limpiar selección
              </button>
              <Link
                href="/"
                className="app-button-primary inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold"
              >
                Ver catálogo público
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
