"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Home, Minus, Phone, Plus, Search, ShoppingBag, UserRound } from "lucide-react";
import Link from "next/link";
import { useAppFeedback } from "@/hooks/useAppFeedback";
import { formatChileanMobileInput } from "@/lib/chile-phone";
import {
  normalizeCustomerDisplayName,
  normalizeCustomerLookupValue
} from "@/lib/customers/identity";
import {
  addLine,
  computeTotal,
  computeTotalUnits,
  removeLine,
  updateQuantity as updateCartQuantity,
  type DirectSaleCartLine
} from "@/lib/direct-sale-cart";
import { formatCurrency } from "@/lib/format";
import {
  filterAndSortFamilies,
  getDefaultVariant,
  getSelectableVariants,
  groupProductsIntoFamilies,
  type ProductFamily
} from "@/lib/product-families";
import {
  feedbackMessages,
  formatDirectSaleConfirmationDescription
} from "@/lib/ui/feedback-messages";
import type { AdminCustomerOption, AdminDirectSaleRequest, ProductRecord } from "@/lib/types";

type ExistingCustomer = {
  id: string;
  nombre: string;
  telefono: string;
  lugarTrabajo: string;
};

type DirectSaleFastFlowProps = {
  initialCustomers: AdminCustomerOption[];
};

type SuccessSummary = {
  pedidoId: string;
  codigo?: string;
  productCount: number;
  unitCount: number;
  total: number;
  formaPago: "EFECTIVO" | "TRANSFERENCIA";
  fecha: string;
};

const SEARCH_DEBOUNCE_MS = 300;
const MAX_RESULTS = 20;

function normalizarTexto(value: string) {
  return normalizeCustomerLookupValue(value);
}

function buildCustomerKey(customer: Pick<ExistingCustomer, "nombre" | "telefono" | "lugarTrabajo">) {
  return [
    customer.telefono.replace(/\D/g, ""),
    normalizarTexto(normalizeCustomerDisplayName(customer.nombre)),
    normalizarTexto(customer.lugarTrabajo)
  ].join("|");
}

export function DirectSaleFastFlow({ initialCustomers }: DirectSaleFastFlowProps) {
  const feedback = useAppFeedback();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);

  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadProducts() {
      try {
        const response = await fetch("/api/admin/products/search");
        const data = (await response.json()) as { products?: ProductRecord[]; error?: string };

        if (!response.ok) {
          throw new Error(data.error ?? "No fue posible cargar el catálogo.");
        }

        if (!cancelled) {
          setProducts(data.products ?? []);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : "No fue posible cargar el catálogo."
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingProducts(false);
        }
      }
    }

    void loadProducts();

    return () => {
      cancelled = true;
    };
  }, []);

  const families = useMemo(() => groupProductsIntoFamilies(products), [products]);

  const customers = useMemo(() => {
    const map = new Map<string, ExistingCustomer>();

    initialCustomers.forEach((customer) => {
      map.set(buildCustomerKey(customer), {
        id: customer.id,
        nombre: normalizeCustomerDisplayName(customer.nombre),
        telefono: customer.telefono,
        lugarTrabajo: customer.lugarTrabajo ?? ""
      });
    });

    return Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [initialCustomers]);

  // Buscador --------------------------------------------------------------
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [resultsOpen, setResultsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const results = useMemo(() => {
    if (!debouncedQuery.trim()) {
      return [];
    }

    return filterAndSortFamilies(families, { query: debouncedQuery }).slice(0, MAX_RESULTS);
  }, [families, debouncedQuery]);

  // highlightedIndex vuelve a 0 en el onChange del buscador (accion del
  // usuario, no un effect). Este clamp solo cubre el caso borde de que la
  // lista de resultados se achique (debounce) mientras el indice resaltado
  // seguia apuntando a una posicion que ya no existe.
  const activeIndex = Math.min(highlightedIndex, Math.max(results.length - 1, 0));

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!resultsContainerRef.current?.contains(event.target as Node)) {
        setResultsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Seleccion de producto/variante -----------------------------------------
  const [selectedFamily, setSelectedFamily] = useState<ProductFamily | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [quantityInput, setQuantityInput] = useState("1");
  const [selectionError, setSelectionError] = useState("");

  const selectableVariants = selectedFamily ? getSelectableVariants(selectedFamily) : [];
  const selectedVariant =
    selectableVariants.find((variant) => variant.productId === selectedVariantId) ?? null;

  function selectFamily(family: ProductFamily) {
    const variants = getSelectableVariants(family);

    if (variants.length === 0) {
      return;
    }

    const defaultVariant = getDefaultVariant(family);
    setSelectedFamily(family);
    setSelectedVariantId(defaultVariant.productId);
    setQuantityInput("1");
    setSelectionError("");
    setQuery("");
    setResultsOpen(false);
    setHighlightedIndex(0);
  }

  function clearSelection() {
    setSelectedFamily(null);
    setSelectedVariantId("");
    setQuantityInput("1");
    setSelectionError("");
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!resultsOpen || results.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((current) => Math.min(current + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const family = results[activeIndex];
      if (family) {
        selectFamily(family);
      }
    } else if (event.key === "Escape") {
      setResultsOpen(false);
    }
  }

  function stepQuantity(delta: number) {
    if (!selectedVariant) {
      return;
    }

    const current = Number.parseInt(quantityInput, 10) || 0;
    const next = Math.min(Math.max(current + delta, 1), Math.max(selectedVariant.stockActual, 1));
    setQuantityInput(String(next));
    setSelectionError("");
  }

  function addSelectedToCart() {
    if (!selectedFamily || !selectedVariant) {
      return;
    }

    const quantity = Number.parseInt(quantityInput, 10);

    if (!Number.isInteger(quantity) || quantity < 1) {
      setSelectionError("Ingresa una cantidad válida.");
      return;
    }

    if (quantity > selectedVariant.stockActual) {
      setSelectionError(`Solo quedan ${selectedVariant.stockActual} unidad(es) disponibles.`);
      return;
    }

    setCartLines((current) => addLine(current, selectedFamily, selectedVariant, quantity));
    clearSelection();
    searchInputRef.current?.focus();
  }

  // Carrito -----------------------------------------------------------------
  const [cartLines, setCartLines] = useState<DirectSaleCartLine[]>([]);
  const total = computeTotal(cartLines);
  const totalUnits = computeTotalUnits(cartLines);

  function updateLineQuantity(productId: string, nextQuantity: number) {
    setCartLines((current) => updateCartQuantity(current, productId, nextQuantity));
  }

  function removeLineFromCart(productId: string) {
    setCartLines((current) => removeLine(current, productId));
  }

  // Datos de la venta ---------------------------------------------------------
  const [customerMode, setCustomerMode] = useState<"ocasional" | "existente" | "nuevo">(
    "ocasional"
  );
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerPlace, setCustomerPlace] = useState("");
  const [paymentState, setPaymentState] = useState<"PAGADO" | "FIADO">("PAGADO");
  const [formaPago, setFormaPago] = useState<"EFECTIVO" | "TRANSFERENCIA">("EFECTIVO");
  const [observacion, setObservacion] = useState("");

  const customerSearchQuery = normalizarTexto(customerSearch);
  const filteredCustomers = useMemo(() => {
    if (!customerSearchQuery) {
      return customers;
    }

    return customers.filter(
      (customer) =>
        normalizarTexto(customer.nombre).includes(customerSearchQuery) ||
        normalizarTexto(customer.telefono).includes(customerSearchQuery) ||
        normalizarTexto(customer.lugarTrabajo).includes(customerSearchQuery)
    );
  }, [customerSearchQuery, customers]);

  const matchedCustomer = useMemo(() => {
    if (selectedCustomerId) {
      return customers.find((customer) => customer.id === selectedCustomerId) ?? null;
    }

    const normalizedName = normalizarTexto(customerName);
    const normalizedPhone = customerPhone.replace(/\D/g, "");

    return (
      customers.find((customer) => {
        const phoneMatches =
          normalizedPhone.length > 0 && customer.telefono.replace(/\D/g, "") === normalizedPhone;
        const nameMatches = normalizedName.length > 0 && normalizarTexto(customer.nombre) === normalizedName;

        return phoneMatches || nameMatches;
      }) ?? null
    );
  }, [customerName, customerPhone, customers, selectedCustomerId]);

  function syncExistingCustomer(customerId: string) {
    setSelectedCustomerId(customerId);
    const customer = customers.find((item) => item.id === customerId);

    if (!customer) {
      return;
    }

    setCustomerName(customer.nombre);
    setCustomerPhone(customer.telefono);
    setCustomerPlace(customer.lugarTrabajo);
    setCustomerSearch(customer.nombre);
  }

  // Confirmacion y envio -----------------------------------------------------
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState("");
  const [successSummary, setSuccessSummary] = useState<SuccessSummary | null>(null);
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());

  function resetForm() {
    setCartLines([]);
    setCustomerMode("ocasional");
    setSelectedCustomerId("");
    setCustomerSearch("");
    setCustomerName("");
    setCustomerPhone("");
    setCustomerPlace("");
    setPaymentState("PAGADO");
    setFormaPago("EFECTIVO");
    setObservacion("");
    clearSelection();
    setQuery("");
    idempotencyKeyRef.current = crypto.randomUUID();
  }

  const canSubmit = cartLines.length > 0 && !submitting;

  async function submitDirectSale() {
    if (cartLines.length === 0) {
      setServerError("Agrega al menos un producto antes de registrar la venta.");
      return;
    }

    if (paymentState === "FIADO" && !customerName.trim()) {
      setServerError("Para dejar fiado, registra al menos el nombre del cliente.");
      return;
    }

    const confirmed = await feedback.confirm({
      title: feedbackMessages.confirmDirectSaleTitle,
      description: formatDirectSaleConfirmationDescription({
        productCount: cartLines.length,
        unitCount: totalUnits,
        total,
        formaPago: paymentState === "FIADO" ? "Fiado" : formaPago === "EFECTIVO" ? "Efectivo" : "Transferencia"
      }),
      confirmLabel: "Registrar venta",
      cancelLabel: "Seguir editando",
      tone: "default"
    });

    if (!confirmed) {
      return;
    }

    setSubmitting(true);
    setServerError("");

    try {
      const payload: AdminDirectSaleRequest = {
        clienteId: matchedCustomer?.id,
        nombre: customerName || undefined,
        telefono: customerPhone || undefined,
        lugarTrabajo: customerPlace || undefined,
        items: cartLines.map((line) => ({ productoId: line.productId, cantidad: line.cantidad })),
        estadoPago: paymentState,
        formaPago,
        clienteModo: customerMode,
        observacion: observacion || undefined,
        idempotencyKey: idempotencyKeyRef.current
      };

      const response = await fetch("/api/admin/direct-sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = (await response.json()) as { error?: string; pedidoId?: string; codigo?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "No fue posible registrar la venta directa.");
      }

      setSuccessSummary({
        pedidoId: data.pedidoId ?? "",
        codigo: data.codigo,
        productCount: cartLines.length,
        unitCount: totalUnits,
        total,
        formaPago,
        fecha: new Date().toLocaleString("es-CL")
      });
      resetForm();
    } catch (error) {
      setServerError(
        error instanceof Error ? error.message : "No fue posible registrar la venta."
      );
    } finally {
      setSubmitting(false);
    }
  }

  function registerAnotherSale() {
    setSuccessSummary(null);
    setServerError("");
    searchInputRef.current?.focus();
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-[1100px] flex-col gap-6 overflow-x-hidden bg-[#f7f8fa] px-4 py-4 pb-[calc(88px+env(safe-area-inset-bottom))] sm:px-6 lg:px-8">
      <section className="overflow-hidden rounded-2xl bg-[#17191f] text-white shadow-[0_16px_36px_rgba(17,19,24,0.16)]">
        <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-end sm:justify-between sm:p-8">
          <div className="space-y-2">
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#c8c0ff]">
              <ShoppingBag className="h-3.5 w-3.5" />
              Admin Smellme.cl
            </span>
            <h1 className="text-3xl font-bold tracking-[-0.04em] text-white">Venta directa</h1>
            <p className="max-w-xl text-sm leading-6 text-white/60">
              Registra una venta presencial, telefónica o al paso en segundos.
            </p>
          </div>
          <Link
            href="/admin"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white"
          >
            <Home className="h-4 w-4" />
            Inicio
          </Link>
        </div>
      </section>

      {successSummary ? (
        <section className="rounded-[24px] border border-brand-200 bg-brand-50 p-5 text-brand-900">
          <h2 className="text-lg font-semibold">Venta registrada correctamente</h2>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            <SummaryFact label="Código" value={successSummary.codigo ?? successSummary.pedidoId} />
            <SummaryFact label="Productos" value={String(successSummary.productCount)} />
            <SummaryFact label="Unidades" value={String(successSummary.unitCount)} />
            <SummaryFact label="Total" value={formatCurrency(successSummary.total)} />
            <SummaryFact
              label="Forma de pago"
              value={successSummary.formaPago === "EFECTIVO" ? "Efectivo" : "Transferencia"}
            />
            <SummaryFact label="Fecha" value={successSummary.fecha} />
          </dl>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={registerAnotherSale}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
            >
              Registrar otra venta
            </button>
            <Link
              href="/admin/ventas"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-brand-200 bg-white px-4 py-2.5 text-sm font-semibold text-brand-700"
            >
              Ver ventas
            </Link>
          </div>
        </section>
      ) : (
        <section className="grid w-full max-w-full min-w-0 gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <div ref={resultsContainerRef} className="relative space-y-2">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-[#111318]">Buscar producto</span>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#667085]" />
                  <input
                    ref={searchInputRef}
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setResultsOpen(true);
                      setHighlightedIndex(0);
                    }}
                    onFocus={() => setResultsOpen(true)}
                    onKeyDown={handleSearchKeyDown}
                    placeholder="Buscar por perfume, marca, contenido o SKU..."
                    className="block min-h-11 w-full min-w-0 max-w-full rounded-[18px] border border-[#e4e7ec] bg-white py-3 pl-11 pr-4 text-base text-[#111318] outline-none"
                  />
                </div>
              </label>

              {resultsOpen && debouncedQuery.trim() ? (
                <div className="absolute z-20 max-h-80 w-full overflow-y-auto rounded-[18px] border border-[#e4e7ec] bg-white shadow-lg">
                  {loadingProducts ? (
                    <div className="px-4 py-3 text-sm text-[#667085]">Cargando catálogo...</div>
                  ) : results.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-[#667085]">Sin resultados.</div>
                  ) : (
                    results.map((family, index) => {
                      const variants = getSelectableVariants(family);
                      const minPrice = Math.min(...variants.map((v) => v.precioVenta));
                      const totalStock = variants.reduce((sum, v) => sum + v.stockActual, 0);
                      const skuLabel = variants.length === 1 ? variants[0].sku : undefined;

                      return (
                        <button
                          key={family.key}
                          type="button"
                          onClick={() => selectFamily(family)}
                          onMouseEnter={() => setHighlightedIndex(index)}
                          className={`block w-full border-b border-[#f2f4f7] px-4 py-3 text-left last:border-b-0 ${
                            index === activeIndex ? "bg-brand-50" : "bg-white"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-semibold text-[#111318]">{family.nombre}</span>
                            <span className="text-sm font-semibold text-[#111318]">
                              {formatCurrency(minPrice)}
                            </span>
                          </div>
                          <div className="mt-0.5 flex items-center justify-between gap-3 text-xs text-[#667085]">
                            <span>
                              {family.marca}
                              {variants.length > 1 ? ` · ${variants.length} presentaciones` : ""}
                              {skuLabel ? ` · ${skuLabel}` : ""}
                            </span>
                            <span>{totalStock > 0 ? `${totalStock} disp.` : "Sin stock"}</span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              ) : null}
            </div>

            {loadError ? (
              <div className="rounded-[18px] border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-800">
                {loadError}
              </div>
            ) : null}

            {selectedFamily && selectedVariant ? (
              <div className="space-y-4 rounded-[24px] border border-[#e4e7ec] bg-white p-5 shadow-soft">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#667085]">
                    Producto seleccionado
                  </p>
                  <p className="text-lg font-semibold text-[#111318]">
                    {selectedFamily.marca} · {selectedFamily.nombre}
                  </p>
                </div>

                {selectableVariants.length > 1 ? (
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-[#111318]">Presentación</span>
                    <select
                      value={selectedVariantId}
                      onChange={(event) => {
                        setSelectedVariantId(event.target.value);
                        setQuantityInput("1");
                        setSelectionError("");
                      }}
                      className="block min-h-11 w-full max-w-full rounded-[18px] border border-[#e4e7ec] bg-white px-4 py-3 text-base text-[#111318]"
                    >
                      {selectableVariants.map((variant) => (
                        <option
                          key={variant.productId}
                          value={variant.productId}
                          disabled={!variant.disponible}
                        >
                          {variant.contenido} — {formatCurrency(variant.precioVenta)}
                          {variant.disponible ? "" : " (Sin stock)"}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <p className="text-sm text-[#667085]">{selectedVariant.contenido}</p>
                )}

                <div className="flex flex-wrap items-center gap-4 text-sm text-[#667085]">
                  <span className="font-semibold text-[#111318]">
                    {formatCurrency(selectedVariant.precioVenta)}
                  </span>
                  <span>
                    {selectedVariant.disponible
                      ? `${selectedVariant.stockActual} disponible(s)`
                      : "Sin stock"}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-[#111318]">Cantidad</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => stepQuantity(-1)}
                      aria-label="Disminuir cantidad"
                      className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#e4e7ec] bg-white text-[#111318]"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={Math.max(selectedVariant.stockActual, 1)}
                      value={quantityInput}
                      onChange={(event) => {
                        setQuantityInput(event.target.value.replace(/[^0-9]/g, ""));
                        setSelectionError("");
                      }}
                      className="h-11 w-16 rounded-xl border border-[#e4e7ec] text-center text-base text-[#111318] outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => stepQuantity(1)}
                      aria-label="Aumentar cantidad"
                      className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#e4e7ec] bg-white text-[#111318]"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {selectionError ? (
                  <p className="text-sm text-brand-800">{selectionError}</p>
                ) : null}

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={!selectedVariant.disponible}
                    onClick={addSelectedToCart}
                    className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-brand-200"
                  >
                    Agregar
                  </button>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#e4e7ec] bg-white px-4 py-2.5 text-sm font-semibold text-[#667085]"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : null}

            <div className="space-y-3 rounded-[24px] border border-[#e4e7ec] bg-white p-5 shadow-soft">
              <h2 className="text-base font-semibold text-[#111318]">Resumen de venta</h2>

              {cartLines.length === 0 ? (
                <p className="text-sm text-[#667085]">Aún no agregas productos.</p>
              ) : (
                <ul className="divide-y divide-[#f2f4f7]">
                  {cartLines.map((line) => (
                    <li key={line.productId} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#111318]">
                          {line.marca ? `${line.marca} · ` : ""}
                          {line.nombre} · {line.contenido}
                        </p>
                        <p className="text-xs text-[#667085]">
                          {line.cantidad} × {formatCurrency(line.precioVenta)} ={" "}
                          {formatCurrency(line.precioVenta * line.cantidad)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          aria-label="Disminuir"
                          onClick={() => updateLineQuantity(line.productId, line.cantidad - 1)}
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#e4e7ec]"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-6 text-center text-sm">{line.cantidad}</span>
                        <button
                          type="button"
                          aria-label="Aumentar"
                          onClick={() => updateLineQuantity(line.productId, line.cantidad + 1)}
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#e4e7ec]"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeLineFromCart(line.productId)}
                          className="text-xs font-semibold text-brand-700"
                        >
                          Quitar
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex items-center justify-between border-t border-[#f2f4f7] pt-3 text-sm font-semibold text-[#111318]">
                <span>Total</span>
                <span>{formatCurrency(total)}</span>
              </div>
            </div>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-6 lg:h-fit">
            <div className="space-y-4 rounded-[24px] border border-[#e4e7ec] bg-white p-5 shadow-soft">
              <h2 className="text-base font-semibold text-[#111318]">Datos de la venta</h2>

              <div className="grid gap-3 sm:grid-cols-3">
                <ChoiceButton
                  active={customerMode === "ocasional"}
                  label="Ocasional"
                  onClick={() => setCustomerMode("ocasional")}
                />
                <ChoiceButton
                  active={customerMode === "existente"}
                  label="Existente"
                  onClick={() => setCustomerMode("existente")}
                />
                <ChoiceButton
                  active={customerMode === "nuevo"}
                  label="Nuevo"
                  onClick={() => setCustomerMode("nuevo")}
                />
              </div>

              {customerMode === "existente" ? (
                <div className="space-y-2">
                  <input
                    value={customerSearch}
                    onChange={(event) => {
                      setCustomerSearch(event.target.value);
                      setSelectedCustomerId("");
                    }}
                    placeholder="Buscar cliente por nombre o teléfono"
                    className="block min-h-11 w-full max-w-full rounded-[18px] border border-[#e4e7ec] bg-white px-4 py-3 text-base text-[#111318] outline-none"
                  />
                  <select
                    value={selectedCustomerId}
                    onChange={(event) => syncExistingCustomer(event.target.value)}
                    className="block min-h-11 w-full max-w-full rounded-[18px] border border-[#e4e7ec] bg-white px-4 py-3 text-base text-[#111318]"
                  >
                    <option value="">
                      {customers.length === 0 ? "No hay clientes registrados" : "Selecciona cliente"}
                    </option>
                    {filteredCustomers.slice(0, 50).map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              {customerMode !== "ocasional" ? (
                <div className="grid gap-3">
                  <TextField
                    label="Nombre"
                    value={customerName}
                    onChange={setCustomerName}
                    icon={<UserRound className="h-4 w-4" />}
                  />
                  <TextField
                    label="Teléfono opcional"
                    value={customerPhone}
                    onChange={(value) => setCustomerPhone(formatChileanMobileInput(value))}
                    icon={<Phone className="h-4 w-4" />}
                  />
                </div>
              ) : null}

              {matchedCustomer ? (
                <p className="rounded-[14px] border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-800">
                  Se asociará al cliente existente {matchedCustomer.nombre}.
                </p>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <ChoiceButton
                  active={paymentState === "PAGADO"}
                  label="Pagado"
                  onClick={() => setPaymentState("PAGADO")}
                />
                <ChoiceButton
                  active={paymentState === "FIADO"}
                  label="Fiado"
                  onClick={() => setPaymentState("FIADO")}
                />
              </div>

              {paymentState === "PAGADO" ? (
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-[#111318]">Forma de pago</span>
                  <select
                    value={formaPago}
                    onChange={(event) => setFormaPago(event.target.value as "EFECTIVO" | "TRANSFERENCIA")}
                    className="block min-h-11 w-full max-w-full rounded-[18px] border border-[#e4e7ec] bg-white px-4 py-3 text-base text-[#111318]"
                  >
                    <option value="EFECTIVO">Efectivo</option>
                    <option value="TRANSFERENCIA">Transferencia</option>
                  </select>
                </label>
              ) : null}

              <label className="block space-y-2">
                <span className="text-sm font-medium text-[#111318]">Observación opcional</span>
                <textarea
                  value={observacion}
                  onChange={(event) => setObservacion(event.target.value)}
                  rows={2}
                  className="w-full rounded-[18px] border border-[#e4e7ec] bg-white px-4 py-3 text-base text-[#111318] outline-none"
                />
              </label>

              {serverError ? (
                <p className="rounded-[14px] border border-brand-100 bg-brand-50 px-3 py-2 text-sm text-brand-800">
                  {serverError}
                </p>
              ) : null}

              <button
                type="button"
                disabled={!canSubmit}
                onClick={() => void submitDirectSale()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-[20px] bg-brand-600 px-4 py-4 text-base font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-brand-200"
              >
                <ShoppingBag className="h-5 w-5" />
                {submitting ? "Registrando venta..." : "Confirmar venta"}
              </button>
            </div>
          </aside>
        </section>
      )}
    </main>
  );
}

function ChoiceButton({
  active,
  label,
  onClick
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-11 rounded-[16px] border px-3 py-2 text-sm font-semibold transition ${
        active ? "border-brand-200 bg-brand-50 text-brand-800" : "border-[#e4e7ec] bg-white text-[#667085]"
      }`}
    >
      {label}
    </button>
  );
}

function TextField({
  label,
  value,
  onChange,
  icon
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  icon: React.ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-[#111318]">{label}</span>
      <div className="flex items-center gap-3 rounded-[18px] border border-[#e4e7ec] bg-white px-4 py-3">
        <span className="text-[#667085]">{icon}</span>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full min-w-0 border-0 bg-transparent p-0 text-base text-[#111318] outline-none"
        />
      </div>
    </label>
  );
}

function SummaryFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-brand-200 bg-white px-3 py-2">
      <p className="text-xs text-[#667085]">{label}</p>
      <p className="text-sm font-semibold text-[#111318]">{value}</p>
    </div>
  );
}
