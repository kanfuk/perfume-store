"use client";
import { useMemo, useState, useSyncExternalStore } from "react";
import {
  BadgeCheck,
  Building2,
  CalendarClock,
  Home,
  NotebookPen,
  Phone,
  Search,
  ShoppingBag,
  Sparkles,
  UserRound
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { CartSummary } from "@/components/shared/CartSummary";
import { ProductCatalog } from "@/components/shared/ProductCatalog";
import { WhatsAppFloatingButton } from "@/components/shared/WhatsAppFloatingButton";
import { formatChileanMobileInput } from "@/lib/chile-phone";
import {
  normalizeCustomerDisplayName,
  normalizeCustomerLookupValue
} from "@/lib/customers/identity";
import { getChileTodayInputValue } from "@/lib/date";
import { formatCurrency } from "@/lib/format";
import { calcularTotalPedido, normalizarProductoParaCarrito } from "@/lib/order-helpers";
import {
  getAvailableProductStock,
  normalizeStockValue,
  shouldDecreaseStock
} from "@/lib/stock";
import type {
  AdminCustomerOption,
  AdminDashboardData,
  AdminProductRecord
} from "@/lib/types";

type Mode = "catalogo" | "personalizado";

type AdminDirectSaleProps = {
  initialDashboard: AdminDashboardData;
  initialProducts: AdminProductRecord[];
  initialCustomers: AdminCustomerOption[];
};

type ExistingCustomer = {
  id: string;
  nombre: string;
  telefono: string;
  lugarTrabajo: string;
};

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

const initialCustomForm = {
  nombre: "",
  telefono: "",
  lugarTrabajo: "",
  nombreProducto: "",
  productoBaseId: "",
  descripcion: "",
  cantidad: "1",
  precioAcordado: "",
  costoEstimadoTotal: "",
  fechaEntrega: "",
  estadoInicial: "PENDIENTE" as "PENDIENTE" | "AGENDADO" | "PAGADO" | "FIADO"
};

const QUICK_QUANTITY_OPTIONS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20] as const;
const OTHER_QUANTITY_VALUE = "other";

function subscribeToTodaySnapshot() {
  return () => undefined;
}

function getEmptyTodaySnapshot() {
  return "";
}

function getProductSelectLabel(product: AdminProductRecord) {
  return product.nombre;
}

export function AdminDirectSale({
  initialDashboard,
  initialProducts,
  initialCustomers
}: AdminDirectSaleProps) {
  const todayDate = useSyncExternalStore(
    subscribeToTodaySnapshot,
    getChileTodayInputValue,
    getEmptyTodaySnapshot
  );

  const products = useMemo(
    () =>
      initialProducts.map((product) => ({
        ...product,
        stockActual: product.stockActual,
        stockAgenda: product.stockAgenda
      })),
    [initialProducts]
  );
  const catalogProducts = useMemo(() => products.filter((product) => product.activo), [products]);
  const customers = useMemo(() => {
    const map = new Map<string, ExistingCustomer>();
    const allOrders = [
      ...initialDashboard.pendientes,
      ...initialDashboard.agendados,
      ...initialDashboard.finalizados,
      ...initialDashboard.cancelados
    ];

    initialCustomers.forEach((customer) => {
      map.set(buildCustomerKey(customer), {
        ...customer,
        nombre: normalizeCustomerDisplayName(customer.nombre)
      });
    });

    allOrders.forEach((order) => {
      const key = buildCustomerKey({
        nombre: order.clienteNombre,
        telefono: order.clienteTelefono,
        lugarTrabajo: order.clienteLugarTrabajo
      });

      if (!map.has(key)) {
        map.set(key, {
          id: order.clienteId,
          nombre: normalizeCustomerDisplayName(order.clienteNombre),
          telefono: order.clienteTelefono,
          lugarTrabajo: order.clienteLugarTrabajo
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [initialCustomers, initialDashboard]);

  const [mode, setMode] = useState<Mode>("catalogo");
  const [saleItems, setSaleItems] = useState<Array<{ productoId: string; cantidad: number }>>([]);
  const [customerMode, setCustomerMode] = useState<"ocasional" | "existente" | "nuevo">(
    "ocasional"
  );
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerPlace, setCustomerPlace] = useState("");
  const [paymentState, setPaymentState] = useState<"PAGADO" | "FIADO">("PAGADO");
  const [catalogNote, setCatalogNote] = useState("");
  const [customForm, setCustomForm] = useState(initialCustomForm);
  const [customSelectedCustomerId, setCustomSelectedCustomerId] = useState("");
  const [customCustomerSearch, setCustomCustomerSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [stockLimitMessage, setStockLimitMessage] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [selectedCatalogProductId, setSelectedCatalogProductId] = useState("");
  const [catalogQuantityChoice, setCatalogQuantityChoice] = useState("1");
  const [catalogManualQuantity, setCatalogManualQuantity] = useState("");
  const [customQuantityChoice, setCustomQuantityChoice] = useState("1");
  const [customManualQuantity, setCustomManualQuantity] = useState("");

  const cartLines = useMemo(
    () => normalizarProductoParaCarrito(saleItems, products),
    [products, saleItems]
  );
  const total = calcularTotalPedido(cartLines);
  const quantities = useMemo(
    () => Object.fromEntries(saleItems.map((item) => [item.productoId, item.cantidad])),
    [saleItems]
  );
  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();

    if (!query) {
      return catalogProducts;
    }

    return catalogProducts.filter((product) =>
      [product.nombre, product.descripcion, product.tipoProducto]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [catalogProducts, productSearch]);
  const customTotal =
    (Number(customForm.cantidad) || 0) * (Number(customForm.precioAcordado) || 0);
  const utilidadEstimada =
    customForm.costoEstimadoTotal.trim() && customTotal > 0
      ? customTotal - Number(customForm.costoEstimadoTotal)
      : null;
  const selectedCatalogProduct = useMemo(
    () => products.find((product) => product.id === selectedCatalogProductId) ?? null,
    [products, selectedCatalogProductId]
  );
  const selectedCustomCatalogProduct = useMemo(
    () => products.find((product) => product.id === customForm.productoBaseId) ?? null,
    [customForm.productoBaseId, products]
  );

  const customerSearchQuery = normalizarTexto(customerSearch);
  const normalizedCustomerName = normalizarTexto(customerName);
  const normalizedCustomerPhone = customerPhone.replace(/\D/g, "");
  const normalizedCustomerPlace = normalizarTexto(customerPlace);
  const filteredCustomers = useMemo(() => {
    if (!customerSearchQuery) {
      return customers;
    }

    return customers.filter((customer) => {
      return (
        normalizarTexto(customer.nombre).includes(customerSearchQuery) ||
        normalizarTexto(customer.telefono).includes(customerSearchQuery) ||
        normalizarTexto(customer.lugarTrabajo).includes(customerSearchQuery)
      );
    });
  }, [customerSearchQuery, customers]);
  const matchedCustomer = useMemo(() => {
    if (selectedCustomerId) {
      return customers.find((customer) => customer.id === selectedCustomerId) ?? null;
    }

    return (
      customers.find((customer) => {
        const phoneMatches =
          normalizedCustomerPhone.length > 0 &&
          customer.telefono.replace(/\D/g, "") === normalizedCustomerPhone;
        const nameMatches =
          normalizedCustomerName.length > 0 &&
          normalizarTexto(customer.nombre) === normalizedCustomerName;
        const placeMatches =
          normalizedCustomerPlace.length === 0 ||
          normalizarTexto(customer.lugarTrabajo) === normalizedCustomerPlace;

        return phoneMatches || (nameMatches && placeMatches);
      }) ?? null
    );
  }, [
    customers,
    normalizedCustomerName,
    normalizedCustomerPhone,
    normalizedCustomerPlace,
    selectedCustomerId
  ]);

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

  function handleCustomerSearchChange(value: string) {
    setCustomerSearch(value);
    setSelectedCustomerId("");
  }

  const customCustomerSearchQuery = normalizarTexto(customCustomerSearch);
  const normalizedCustomCustomerName = normalizarTexto(customForm.nombre);
  const normalizedCustomCustomerPhone = customForm.telefono.replace(/\D/g, "");
  const normalizedCustomCustomerPlace = normalizarTexto(customForm.lugarTrabajo);
  const filteredCustomCustomers = useMemo(() => {
    if (!customCustomerSearchQuery) {
      return customers;
    }

    return customers.filter((customer) => {
      return (
        normalizarTexto(customer.nombre).includes(customCustomerSearchQuery) ||
        normalizarTexto(customer.telefono).includes(customCustomerSearchQuery) ||
        normalizarTexto(customer.lugarTrabajo).includes(customCustomerSearchQuery)
      );
    });
  }, [customCustomerSearchQuery, customers]);
  const matchedCustomCustomer = useMemo(() => {
    if (customSelectedCustomerId) {
      return customers.find((customer) => customer.id === customSelectedCustomerId) ?? null;
    }

    return (
      customers.find((customer) => {
        const phoneMatches =
          normalizedCustomCustomerPhone.length > 0 &&
          customer.telefono.replace(/\D/g, "") === normalizedCustomCustomerPhone;
        const nameMatches =
          normalizedCustomCustomerName.length > 0 &&
          normalizarTexto(customer.nombre) === normalizedCustomCustomerName;
        const placeMatches =
          normalizedCustomCustomerPlace.length === 0 ||
          normalizarTexto(customer.lugarTrabajo) === normalizedCustomCustomerPlace;

        return phoneMatches || (nameMatches && placeMatches);
      }) ?? null
    );
  }, [
    customers,
    customSelectedCustomerId,
    normalizedCustomCustomerName,
    normalizedCustomCustomerPhone,
    normalizedCustomCustomerPlace
  ]);

  function syncCustomExistingCustomer(customerId: string) {
    setCustomSelectedCustomerId(customerId);
    const customer = customers.find((item) => item.id === customerId);

    if (!customer) {
      return;
    }

    setCustomForm((current) => ({
      ...current,
      nombre: customer.nombre,
      telefono: customer.telefono,
      lugarTrabajo: customer.lugarTrabajo
    }));
    setCustomCustomerSearch(customer.nombre);
  }

  function handleCustomCustomerSearchChange(value: string) {
    setCustomCustomerSearch(value);
    setCustomSelectedCustomerId("");
  }

  function resolveQuantityValue(quantityChoice: string, manualQuantity: string) {
    if (quantityChoice === OTHER_QUANTITY_VALUE) {
      return normalizeStockValue(manualQuantity);
    }

    return normalizeStockValue(quantityChoice);
  }

  function syncCatalogQuantityChoice(value: string) {
    setCatalogQuantityChoice(value);

    if (value !== OTHER_QUANTITY_VALUE) {
      setCatalogManualQuantity("");
    }
  }

  function syncCustomQuantityChoice(value: string) {
    setCustomQuantityChoice(value);

    if (value !== OTHER_QUANTITY_VALUE) {
      setCustomManualQuantity("");
      setCustomForm((current) => ({
        ...current,
        cantidad: String(normalizeStockValue(value) || 1)
      }));
    }
  }

  function syncCustomManualQuantity(value: string) {
    setCustomManualQuantity(value);
    setCustomForm((current) => ({
      ...current,
      cantidad: String(normalizeStockValue(value))
    }));
  }

  function addProduct(productId: string, quantityToAdd = 1) {
    setSaleItems((current) => {
      const existing = current.find((item) => item.productoId === productId);
      const product = products.find((item) => item.id === productId);

      if (!product) {
        return current;
      }

      const normalizedQuantity = Math.max(1, normalizeStockValue(quantityToAdd));
      const nextQuantity = (existing?.cantidad ?? 0) + normalizedQuantity;
      const availableStock = getAvailableProductStock(product);

      if (shouldDecreaseStock(product) && nextQuantity > availableStock) {
        setStockLimitMessage(
          `Solo quedan ${availableStock} unidades disponibles para ${product.nombre}. Ajustamos la venta a ${availableStock}.`
        );

        if ((existing?.cantidad ?? 0) >= availableStock) {
          return current;
        }

        if (existing) {
          return current.map((item) =>
            item.productoId === productId ? { ...item, cantidad: availableStock } : item
          );
        }

        return [...current, { productoId: productId, cantidad: availableStock }];
      }

      setStockLimitMessage("");

      if (existing) {
        return current.map((item) =>
          item.productoId === productId ? { ...item, cantidad: nextQuantity } : item
        );
      }

      return [...current, { productoId: productId, cantidad: 1 }];
    });
  }

  function updateQuantity(productId: string, nextQuantity: number) {
    setSaleItems((current) => {
      if (nextQuantity <= 0) {
        return current.filter((item) => item.productoId !== productId);
      }

      const product = products.find((item) => item.id === productId);

      if (!product) {
        return current;
      }

      const normalizedQuantity = Math.max(1, normalizeStockValue(nextQuantity));
      const quantity = shouldDecreaseStock(product)
        ? Math.min(normalizedQuantity, getAvailableProductStock(product))
        : normalizedQuantity;

      if (shouldDecreaseStock(product) && normalizedQuantity > quantity) {
        setStockLimitMessage(
          `Solo quedan ${quantity} unidades disponibles para ${product.nombre}. Ajustamos la venta a ${quantity}.`
        );
      } else {
        setStockLimitMessage("");
      }

      return current.map((item) =>
        item.productoId === productId ? { ...item, cantidad: quantity } : item
      );
    });
  }

  function addSelectedCatalogProduct() {
    if (!selectedCatalogProductId) {
      setServerError("Selecciona un producto del catálogo para agregarlo.");
      return;
    }

    const quantity = resolveQuantityValue(catalogQuantityChoice, catalogManualQuantity);

    if (quantity <= 0) {
      setServerError("Selecciona una cantidad válida para agregar al resumen.");
      return;
    }

    setServerError("");
    addProduct(selectedCatalogProductId, quantity);
  }

  function syncCustomProduct(productId: string) {
    const product = products.find((item) => item.id === productId);

    setCustomForm((current) => ({
      ...current,
      productoBaseId: productId,
      nombreProducto: product ? product.nombre : current.nombreProducto,
      precioAcordado:
        product && product.precioVenta > 0 ? String(product.precioVenta) : current.precioAcordado
    }));
  }

  async function submitDirectSale() {
    if (saleItems.length === 0) {
      setServerError("Agrega al menos un producto antes de registrar la venta.");
      return;
    }

    if (paymentState === "FIADO" && !customerName.trim()) {
      setServerError("Para dejar fiado, registra al menos el nombre del cliente.");
      return;
    }

    if (!window.confirm(`Se registrará una venta por ${formatCurrency(total)}. ¿Continuar?`)) {
      return;
    }

    setSubmitting(true);
    setServerError("");
    setSuccessMessage("");

    try {
      const response = await fetch("/api/admin/direct-sales", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          clienteId: matchedCustomer?.id,
          nombre: customerName,
          telefono: customerPhone,
          lugarTrabajo: customerPlace,
          items: saleItems,
          estadoPago: paymentState,
          clienteModo: customerMode,
          observacion: catalogNote
        })
      });
      const data = (await response.json()) as { error?: string; pedidoId?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "No fue posible registrar la venta directa.");
      }

      setSaleItems([]);
      setCatalogNote("");
      setCustomerMode("ocasional");
      setSelectedCustomerId("");
      setCustomerSearch("");
      setCustomerName("");
      setCustomerPhone("");
      setCustomerPlace("");
      setPaymentState("PAGADO");
      setSelectedCatalogProductId("");
      setCatalogQuantityChoice("1");
      setCatalogManualQuantity("");
      setStockLimitMessage("");
      setSuccessMessage(
        `Venta directa registrada correctamente. Código interno: ${data.pedidoId ?? "OK"}.`
      );
    } catch (error) {
      setServerError(
        error instanceof Error ? error.message : "No fue posible registrar la venta."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function submitCustomOrder() {
    setSubmitting(true);
    setServerError("");
    setSuccessMessage("");

    try {
      const response = await fetch("/api/admin/custom-orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          clienteId: matchedCustomCustomer?.id,
          nombre: customForm.nombre,
          telefono: customForm.telefono,
          lugarTrabajo: customForm.lugarTrabajo,
          nombreProducto: customForm.nombreProducto,
          productoBaseId: customForm.productoBaseId || undefined,
          descripcion: customForm.descripcion,
          cantidad: Number(customForm.cantidad),
          precioAcordado: Number(customForm.precioAcordado),
          costoEstimadoTotal: customForm.costoEstimadoTotal.trim()
            ? Number(customForm.costoEstimadoTotal)
            : undefined,
          fechaEntrega: customForm.fechaEntrega || undefined,
          estadoInicial: customForm.estadoInicial
        })
      });
      const data = (await response.json()) as { error?: string; pedidoId?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "No fue posible registrar el pedido personalizado.");
      }
      setCustomForm(initialCustomForm);
      setCustomSelectedCustomerId("");
      setCustomCustomerSearch("");
      setCustomQuantityChoice("1");
      setCustomManualQuantity("");
      setStockLimitMessage("");
      setSuccessMessage(
        `Pedido personalizado registrado correctamente. Código interno: ${data.pedidoId ?? "OK"}.`
      );
    } catch (error) {
      setServerError(
        error instanceof Error
          ? error.message
          : "No fue posible registrar el pedido personalizado."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-7xl flex-col gap-6 overflow-x-hidden px-4 py-5 pb-[calc(88px+env(safe-area-inset-bottom))] sm:px-6">
      <section className="overflow-hidden rounded-[34px] border border-[#cbebd6] bg-[#f3faf4] shadow-soft">
        <div className="bg-[linear-gradient(140deg,#f3faf4_0%,#eaf8ef_48%,#ddf4e5_100%)] p-6 sm:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-4">
              <div className="flex w-fit items-center gap-3 rounded-[24px] border border-white/70 bg-white/85 px-4 py-3 shadow-[0_16px_30px_rgba(31,51,40,0.08)]">
                <div className="relative h-14 w-14 overflow-hidden rounded-[18px] bg-white ring-1 ring-[#d8ebdd]">
                  <Image
                    src="/brand/pauli-store-logo-transparent.png"
                    alt="Logo de Pauli Store"
                    fill
                    className="object-contain p-2"
                    sizes="56px"
                    priority
                  />
                </div>
                <div className="space-y-1">
                  <span className="inline-flex w-fit items-center gap-2 rounded-full bg-[#f3faf4] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#247a4d]">
                    <ShoppingBag className="h-3.5 w-3.5" />
                    Admin Pauli Store
                  </span>
                  <p className="text-sm font-semibold text-[#1f3328]">Ventas ágiles con identidad de marca</p>
                </div>
              </div>
              <div className="space-y-2">
                <h1 className="font-display text-3xl font-semibold text-[#1f3328] sm:text-4xl">
                  Venta directa
                </h1>
                <p className="max-w-3xl text-sm leading-6 text-[#6b7c70] sm:text-base">
                  Registra ventas realizadas en el momento sin usar el formulario público.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/admin"
                className="inline-flex min-h-[56px] min-w-[132px] items-center justify-center gap-2 rounded-[20px] border border-[#d8ebdd] bg-white/80 px-4 py-3 text-center text-sm font-semibold text-[#6b7c70] sm:min-w-[146px]"
              >
                <Home className="h-4 w-4" />
                <span className="hidden sm:inline">Inicio</span>
              </Link>
              <ModeButton
                active={mode === "catalogo"}
                icon={<ShoppingBag className="h-4 w-4" />}
                label="Catálogo"
                onClick={() => setMode("catalogo")}
              />
              <ModeButton
                active={mode === "personalizado"}
                icon={<Sparkles className="h-4 w-4" />}
                label="Personalizada"
                onClick={() => setMode("personalizado")}
              />
            </div>
          </div>
        </div>
      </section>

      {successMessage ? (
        <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
          {successMessage}
        </div>
      ) : null}
      {serverError ? (
        <div className="rounded-[24px] border border-emerald-100 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
          {serverError}
        </div>
      ) : null}
      {stockLimitMessage ? (
        <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          {stockLimitMessage}
        </div>
      ) : null}

      {mode === "catalogo" ? (
        <section className="grid w-full max-w-full min-w-0 gap-6 pb-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <CardSection
              icon={<ShoppingBag className="h-5 w-5" />}
              title="Catálogo interno"
              subtitle="Busca, selecciona o toca tarjetas activas para vender rápido desde el celular."
            >
              <div className="grid gap-4 md:grid-cols-[1.4fr_0.8fr]">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-[#1f3328]">Buscar producto</span>
                  <input
                    value={productSearch}
                    onChange={(event) => setProductSearch(event.target.value)}
                    placeholder="Escribe nombre, tipo o descripción"
                    className="block min-h-11 w-full min-w-0 max-w-full rounded-[18px] border border-[#d8ebdd] bg-white px-4 py-3 text-base text-[#1f3328] outline-none"
                  />
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-[#1f3328]">Producto rápido</span>
                  <select
                    value={selectedCatalogProductId}
                    onChange={(event) => setSelectedCatalogProductId(event.target.value)}
                    className="block min-h-11 w-full min-w-0 max-w-full rounded-[18px] border border-[#d8ebdd] bg-white px-4 py-3 text-base text-[#1f3328]"
                  >
                    <option value="">Selecciona producto</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {getProductSelectLabel(product)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="grid gap-4 md:grid-cols-[0.8fr_0.8fr_auto] md:items-end">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-[#1f3328]">Cantidad</span>
                  <select
                    value={catalogQuantityChoice}
                    onChange={(event) => syncCatalogQuantityChoice(event.target.value)}
                    className="block min-h-11 w-full min-w-0 max-w-full rounded-[18px] border border-[#d8ebdd] bg-white px-4 py-3 text-base text-[#1f3328]"
                  >
                    {QUICK_QUANTITY_OPTIONS.map((quantity) => (
                      <option key={quantity} value={quantity}>
                        {quantity}
                      </option>
                    ))}
                    <option value={OTHER_QUANTITY_VALUE}>Otra cantidad</option>
                  </select>
                </label>
                {catalogQuantityChoice === OTHER_QUANTITY_VALUE ? (
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-[#1f3328]">Otra cantidad</span>
                    <input
                      type="number"
                      min={1}
                      value={catalogManualQuantity}
                      onChange={(event) => setCatalogManualQuantity(event.target.value)}
                      placeholder="Ejemplo: 7"
                      className="block min-h-11 w-full min-w-0 max-w-full rounded-[18px] border border-[#d8ebdd] bg-white px-4 py-3 text-base text-[#1f3328] outline-none"
                    />
                  </label>
                ) : (
                  <div className="rounded-[18px] border border-[#d8ebdd] bg-[#f8fdf9] px-4 py-3 text-sm text-[#6b7c70]">
                    Elige una cantidad sugerida o cambia a &quot;Otra cantidad&quot;.
                  </div>
                )}
                <button
                  type="button"
                  onClick={addSelectedCatalogProduct}
                  className="inline-flex min-h-11 items-center justify-center rounded-[18px] bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
                >
                  Agregar al resumen
                </button>
              </div>
              {selectedCatalogProduct ? (
                <div className="rounded-[18px] border border-[#d8ebdd] bg-[#f8fdf9] px-4 py-3 text-sm text-[#6b7c70]">
                  <strong className="text-[#1f3328]">{selectedCatalogProduct.nombre}</strong>
                  {" · "}
                  {selectedCatalogProduct.activo ? "Activo" : "Inactivo"}
                  {" · "}
                  {shouldDecreaseStock(selectedCatalogProduct)
                    ? `Descuenta stock (${getAvailableProductStock(selectedCatalogProduct)} disponible(s))`
                    : "Se puede vender sin descontar stock"}
                </div>
              ) : null}
              <ProductCatalog
                products={filteredProducts}
                quantities={quantities}
                onAdd={addProduct}
                showStockCount
                footerLabel="Disponibles hoy"
              />
            </CardSection>

            <CardSection
              icon={<UserRound className="h-5 w-5" />}
              title="Datos del cliente"
              subtitle="Puedes dejarlo ocasional, buscar un cliente existente o registrar uno nuevo."
            >
              <div className="grid gap-3 sm:auto-rows-fr sm:grid-cols-3">
                <ChoiceButton
                  active={customerMode === "ocasional"}
                  title="Cliente ocasional"
                  text="Venta rápida sin completar todo."
                  onClick={() => setCustomerMode("ocasional")}
                />
                <ChoiceButton
                  active={customerMode === "existente"}
                  title="Cliente existente"
                  text="Recupera un cliente ya visto en el panel."
                  onClick={() => setCustomerMode("existente")}
                />
                <ChoiceButton
                  active={customerMode === "nuevo"}
                  title="Nuevo cliente"
                  text="Guarda datos si quieres dejar trazabilidad."
                  onClick={() => setCustomerMode("nuevo")}
                />
              </div>

              {customerMode === "existente" ? (
                <div className="space-y-2">
                  <span className="text-sm font-medium text-[#1f3328]">Cliente existente</span>
                  <label className="relative block">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b7c70]" />
                    <input
                      value={customerSearch}
                      onChange={(event) => handleCustomerSearchChange(event.target.value)}
                      placeholder="Busca por nombre, telefono o lugar de trabajo"
                      className="block min-h-11 w-full min-w-0 max-w-full rounded-[18px] border border-[#d8ebdd] bg-white py-3 pl-11 pr-4 text-base text-[#1f3328] outline-none"
                    />
                  </label>
                  <select
                    value={selectedCustomerId}
                    onChange={(event) => syncExistingCustomer(event.target.value)}
                    className="block min-h-11 w-full min-w-0 max-w-full rounded-[18px] border border-[#d8ebdd] bg-white px-4 py-3 text-base text-[#1f3328]"
                  >
                    <option value="">
                      {customers.length === 0
                        ? "No hay clientes registrados"
                        : "Selecciona cliente existente"}
                    </option>
                    {filteredCustomers.slice(0, 50).map((customer) => (
                    <option key={customer.id} value={customer.id}>
                        {customer.nombre}
                    </option>
                  ))}
                </select>
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                <TextField
                  label="Nombre del cliente opcional"
                  value={customerName}
                  onChange={setCustomerName}
                  placeholder="Ejemplo: Paola"
                  icon={<UserRound className="h-4 w-4" />}
                />
                <TextField
                  label="Teléfono opcional"
                  value={customerPhone}
                  onChange={(value) => setCustomerPhone(formatChileanMobileInput(value))}
                  placeholder="9 1234 5678"
                  icon={<Phone className="h-4 w-4" />}
                />
              </div>

              <TextField
                label="Lugar de trabajo opcional"
                value={customerPlace}
                onChange={setCustomerPlace}
                placeholder="Ejemplo: Recepción o piso 3"
                icon={<Building2 className="h-4 w-4" />}
              />

              {matchedCustomer ? (
                <div className="rounded-[18px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  La venta se asociara al cliente existente {matchedCustomer.nombre}.
                </div>
              ) : customerMode !== "ocasional" && normalizedCustomerName ? (
                <div className="rounded-[18px] border border-dashed border-[#d8ebdd] bg-[#f8fdf9] px-4 py-3 text-sm text-[#6b7c70]">
                  Si no coincide con un cliente existente, se registrara como cliente nuevo.
                </div>
              ) : null}

              <div className="grid gap-3 sm:auto-rows-fr sm:grid-cols-2">
                <ChoiceButton
                  active={paymentState === "PAGADO"}
                  title="Pagado"
                  text="Queda FINALIZADO y registra pago."
                  onClick={() => setPaymentState("PAGADO")}
                />
                <ChoiceButton
                  active={paymentState === "FIADO"}
                  title="Fiado"
                  text="Queda FINALIZADO y crea saldo pendiente."
                  onClick={() => setPaymentState("FIADO")}
                />
              </div>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-[#1f3328]">Nota interna opcional</span>
                <textarea
                  value={catalogNote}
                  onChange={(event) => setCatalogNote(event.target.value)}
                  rows={3}
                  className="w-full rounded-[18px] border border-[#d8ebdd] bg-white px-4 py-3 text-base text-[#1f3328] outline-none"
                  placeholder="Ejemplo: venta del pasillo o retiro inmediato"
                />
              </label>
            </CardSection>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-6 xl:h-fit">
            <CartSummary
              lines={cartLines}
              total={total}
              onDecrease={updateQuantity}
              onIncrease={updateQuantity}
              onRemove={(productId) => updateQuantity(productId, 0)}
              emptyText="El resumen aparecerá apenas elijas productos del catálogo."
              title="Resumen de venta"
              subtitle="Mismo calculo del cliente, pero listo para cerrar al instante."
            />

            <div className="rounded-[30px] border border-[#d8ebdd] bg-white/95 p-5 shadow-soft">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                    <BadgeCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-[#1f3328]">
                      Registrar venta
                    </h3>
                    <p className="text-sm text-[#6b7c70]">
                      La venta se guardara como FINALIZADO/{paymentState}.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={submitting || saleItems.length === 0}
                  onClick={() => void submitDirectSale()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-[24px] bg-emerald-600 px-4 py-4 text-base font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-200"
                >
                  <ShoppingBag className="h-5 w-5" />
                  {submitting ? "Registrando venta..." : "Registrar venta"}
                </button>
              </div>
            </div>
          </aside>
        </section>
      ) : (
        <section className="grid w-full max-w-full min-w-0 gap-6 pb-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-6">
            <CardSection
              icon={<Sparkles className="h-5 w-5" />}
              title="Pedido personalizado"
              subtitle="Registra pedidos especiales como queques enteros, preparaciones a pedido u otros productos."
            >
              <div className="space-y-2">
                <span className="text-sm font-medium text-[#1f3328]">Cliente existente opcional</span>
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b7c70]" />
                  <input
                    value={customCustomerSearch}
                    onChange={(event) => handleCustomCustomerSearchChange(event.target.value)}
                    placeholder="Busca por nombre, telefono o lugar de trabajo"
                      className="block min-h-11 w-full min-w-0 max-w-full rounded-[18px] border border-[#d8ebdd] bg-white py-3 pl-11 pr-4 text-base text-[#1f3328] outline-none"
                    />
                  </label>
                <select
                  value={customSelectedCustomerId}
                  onChange={(event) => syncCustomExistingCustomer(event.target.value)}
                  className="block min-h-11 w-full min-w-0 max-w-full rounded-[18px] border border-[#d8ebdd] bg-white px-4 py-3 text-base text-[#1f3328]"
                >
                  <option value="">
                    {customers.length === 0
                      ? "No hay clientes registrados"
                      : "Selecciona cliente existente"}
                  </option>
                  {filteredCustomCustomers.slice(0, 50).map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-[#1f3328]">Producto</span>
                  <select
                    value={customForm.productoBaseId}
                    onChange={(event) => syncCustomProduct(event.target.value)}
                    className="block min-h-11 w-full min-w-0 max-w-full rounded-[18px] border border-[#d8ebdd] bg-white px-4 py-3 text-base text-[#1f3328]"
                  >
                    <option value="">Selecciona producto del catálogo</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {getProductSelectLabel(product)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-[#1f3328]">Cantidad</span>
                  <select
                    value={customQuantityChoice}
                    onChange={(event) => syncCustomQuantityChoice(event.target.value)}
                    className="block min-h-11 w-full min-w-0 max-w-full rounded-[18px] border border-[#d8ebdd] bg-white px-4 py-3 text-base text-[#1f3328]"
                  >
                    {QUICK_QUANTITY_OPTIONS.map((quantity) => (
                      <option key={quantity} value={quantity}>
                        {quantity}
                      </option>
                    ))}
                    <option value={OTHER_QUANTITY_VALUE}>Otra cantidad</option>
                  </select>
                </label>
              </div>
              {customQuantityChoice === OTHER_QUANTITY_VALUE ? (
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-[#1f3328]">Otra cantidad</span>
                  <input
                    type="number"
                    min={1}
                    value={customManualQuantity}
                    onChange={(event) => syncCustomManualQuantity(event.target.value)}
                    placeholder="Ejemplo: 7"
                    className="block min-h-11 w-full min-w-0 max-w-full rounded-[18px] border border-[#d8ebdd] bg-white px-4 py-3 text-base text-[#1f3328] outline-none"
                  />
                </label>
              ) : null}
              {selectedCustomCatalogProduct ? (
                <div className="rounded-[18px] border border-[#d8ebdd] bg-[#f8fdf9] px-4 py-3 text-sm text-[#6b7c70]">
                  <strong className="text-[#1f3328]">{selectedCustomCatalogProduct.nombre}</strong>
                  {" · "}
                  {selectedCustomCatalogProduct.activo ? "Activo" : "Inactivo"}
                  {" · "}
                  {shouldDecreaseStock(selectedCustomCatalogProduct)
                    ? `Descuenta stock (${getAvailableProductStock(selectedCustomCatalogProduct)} disponible(s))`
                    : "Se puede guardar sin descontar stock"}
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                <TextField
                  label="Nombre cliente"
                  value={customForm.nombre}
                  onChange={(value) => setCustomForm((current) => ({ ...current, nombre: value }))}
                  placeholder="Ejemplo: Claudia"
                  icon={<UserRound className="h-4 w-4" />}
                />
                <TextField
                  label="Teléfono opcional"
                  value={customForm.telefono}
                  onChange={(value) =>
                    setCustomForm((current) => ({
                      ...current,
                      telefono: formatChileanMobileInput(value)
                    }))
                  }
                  placeholder="9 1234 5678"
                  icon={<Phone className="h-4 w-4" />}
                />
              </div>

              <TextField
                label="Lugar de trabajo opcional"
                value={customForm.lugarTrabajo}
                onChange={(value) =>
                  setCustomForm((current) => ({ ...current, lugarTrabajo: value }))
                }
                placeholder="Ejemplo: Torre norte"
                icon={<Building2 className="h-4 w-4" />}
              />

              {matchedCustomCustomer ? (
                <div className="rounded-[18px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  Este pedido se asociara al cliente existente {matchedCustomCustomer.nombre}.
                </div>
              ) : normalizedCustomCustomerName ? (
                <div className="rounded-[18px] border border-dashed border-[#d8ebdd] bg-[#f8fdf9] px-4 py-3 text-sm text-[#6b7c70]">
                  Si no coincide con un cliente existente, se registrara como cliente nuevo.
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                <TextField
                  label="Nombre del producto personalizado"
                  value={customForm.nombreProducto}
                  onChange={(value) =>
                    setCustomForm((current) => ({ ...current, nombreProducto: value }))
                  }
                  placeholder="Queque entero de naranja"
                  icon={<NotebookPen className="h-4 w-4" />}
                />
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-[#1f3328]">
                    Fecha de entrega opcional
                  </span>
                  <div className="flex items-center gap-3 rounded-[18px] border border-[#d8ebdd] bg-white px-4 py-3">
                    <span className="text-[#6b7c70]">
                      <CalendarClock className="h-4 w-4" />
                    </span>
                    <input
                      type="date"
                      min={todayDate || undefined}
                      value={customForm.fechaEntrega}
                      onChange={(event) =>
                        setCustomForm((current) => ({
                          ...current,
                          fechaEntrega: event.target.value
                        }))
                      }
                      className="w-full min-w-0 border-0 bg-transparent p-0 text-base text-[#1f3328] outline-none"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        todayDate
                          ? setCustomForm((current) => ({
                              ...current,
                              fechaEntrega: todayDate
                            }))
                          : undefined
                      }
                      disabled={!todayDate}
                      className="shrink-0 rounded-xl border border-[#d8ebdd] bg-[#f6fcf7] px-3 py-2 text-sm font-semibold text-[#247a4d]"
                    >
                      Hoy
                    </button>
                  </div>
                </label>
              </div>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-[#1f3328]">Descripción / observación</span>
                <textarea
                  value={customForm.descripcion}
                  onChange={(event) =>
                    setCustomForm((current) => ({ ...current, descripcion: event.target.value }))
                  }
                  rows={4}
                  className="w-full rounded-[18px] border border-[#d8ebdd] bg-white px-4 py-3 text-base text-[#1f3328] outline-none"
                  placeholder="Detalles del pedido, sabores, relleno o instrucciones."
                />
              </label>

              <div className="grid gap-4 md:grid-cols-3">
                <NumberField
                  label="Cantidad"
                  value={customForm.cantidad}
                  onChange={(value) => {
                    setCustomQuantityChoice(OTHER_QUANTITY_VALUE);
                    syncCustomManualQuantity(value);
                  }}
                />
                <NumberField
                  label="Precio acordado"
                  value={customForm.precioAcordado}
                  onChange={(value) =>
                    setCustomForm((current) => ({ ...current, precioAcordado: value }))
                  }
                />
                <NumberField
                  label="Costo estimado total"
                  value={customForm.costoEstimadoTotal}
                  onChange={(value) =>
                    setCustomForm((current) => ({ ...current, costoEstimadoTotal: value }))
                  }
                />
              </div>

              <div className="space-y-3">
                <div className="text-sm font-medium text-[#1f3328]">Estado inicial del pedido</div>
                  <div className="grid gap-3 sm:auto-rows-fr sm:grid-cols-4">
                  <ChoiceButton
                    active={customForm.estadoInicial === "PENDIENTE"}
                    title="Pendiente"
                    text="Queda PENDIENTE / SIN_PAGO."
                    onClick={() =>
                      setCustomForm((current) => ({ ...current, estadoInicial: "PENDIENTE" }))
                    }
                  />
                  <ChoiceButton
                    active={customForm.estadoInicial === "AGENDADO"}
                    title="Agendado"
                    text="Queda AGENDADO / SIN_PAGO."
                    onClick={() =>
                      setCustomForm((current) => ({ ...current, estadoInicial: "AGENDADO" }))
                    }
                  />
                  <ChoiceButton
                    active={customForm.estadoInicial === "PAGADO"}
                    title="Pagado"
                    text="Queda FINALIZADO / PAGADO."
                    onClick={() =>
                      setCustomForm((current) => ({ ...current, estadoInicial: "PAGADO" }))
                    }
                  />
                  <ChoiceButton
                    active={customForm.estadoInicial === "FIADO"}
                    title="Fiado"
                    text="Queda FINALIZADO / FIADO."
                    onClick={() =>
                      setCustomForm((current) => ({ ...current, estadoInicial: "FIADO" }))
                    }
                  />
                </div>
              </div>
            </CardSection>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-6 xl:h-fit">
            <div className="rounded-[30px] border border-[#d8ebdd] bg-white/95 p-5 shadow-soft">
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-[#1f3328]">Resumen antes de guardar</h3>
                  <p className="mt-1 text-sm text-[#6b7c70]">
                    Cliente, producto, total y estado en una sola vista.
                  </p>
                </div>

                <SummaryFact label="Cliente" value={customForm.nombre || "Sin nombre"} />
                <SummaryFact
                  label="Producto"
                  value={customForm.nombreProducto || "Sin definir"}
                />
                <SummaryFact
                  label="Tipo"
                  value={
                    customForm.productoBaseId
                      ? "Vinculada a catálogo"
                      : "Personalizada libre"
                  }
                />
                <SummaryFact label="Cantidad" value={customForm.cantidad || "0"} />
                <SummaryFact label="Total" value={formatCurrency(customTotal)} />
                <SummaryFact
                  label="Estado"
                  value={
                    customForm.estadoInicial === "PENDIENTE"
                      ? "PENDIENTE / SIN_PAGO"
                      : customForm.estadoInicial === "AGENDADO"
                      ? "AGENDADO / SIN_PAGO"
                      : customForm.estadoInicial === "PAGADO"
                        ? "FINALIZADO / PAGADO"
                        : "FINALIZADO / FIADO"
                  }
                />
                <SummaryFact
                  label="Utilidad estimada"
                  value={
                    utilidadEstimada === null
                      ? "No calculada"
                      : formatCurrency(utilidadEstimada)
                  }
                />

                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void submitCustomOrder()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-[24px] bg-emerald-600 px-4 py-4 text-base font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-200"
                >
                  <Sparkles className="h-5 w-5" />
                  {submitting
                    ? "Registrando pedido..."
                    : "Registrar pedido personalizado"}
                </button>
              </div>
            </div>
          </aside>
        </section>
      )}

      <Link
        href="/admin"
        className="fixed bottom-[calc(24px+env(safe-area-inset-bottom))] right-4 z-40 inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#d8ebdd] bg-white/95 text-[#6b7c70] shadow-soft backdrop-blur md:hidden"
        aria-label="Inicio admin"
      >
        <Home className="h-4 w-4" />
      </Link>
      <WhatsAppFloatingButton bottomOffsetClassName="bottom-[calc(88px+env(safe-area-inset-bottom))]" />
    </main>
  );
}

function CardSection({
  icon,
  title,
  subtitle,
  children
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-[30px] border border-[#d8ebdd] bg-white/95 p-5 shadow-soft backdrop-blur sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#3fa66b] shadow-sm">
          {icon}
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[#1f3328]">{title}</h2>
          <p className="copy-justified text-sm text-[#6b7c70]">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function ModeButton({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-[56px] min-w-[132px] items-center justify-center gap-2 rounded-[20px] px-4 py-3 text-center text-sm font-semibold transition sm:min-w-[146px] ${
        active
          ? "bg-[#3fa66b] text-white"
          : "border border-[#d8ebdd] bg-white/80 text-[#6b7c70]"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function ChoiceButton({
  active,
  title,
  text,
  onClick
}: {
  active: boolean;
  title: string;
  text: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-full flex-col justify-between rounded-[22px] border px-4 py-4 text-left transition ${
        active
          ? "border-emerald-200 bg-emerald-50 shadow-soft"
          : "border-[#d8ebdd] bg-white"
      }`}
    >
      <div className="font-semibold text-[#1f3328]">{title}</div>
      <div className="mt-1 text-sm leading-6 text-[#6b7c70]">{text}</div>
    </button>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  icon
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  icon: React.ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-[#1f3328]">{label}</span>
      <div className="flex items-center gap-3 rounded-[18px] border border-[#d8ebdd] bg-white px-4 py-3">
        <span className="text-[#6b7c70]">{icon}</span>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="w-full min-w-0 border-0 bg-transparent p-0 text-base text-[#1f3328] outline-none placeholder:text-[#6b7c70]"
        />
      </div>
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-[#1f3328]">{label}</span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="block min-h-11 w-full min-w-0 max-w-full rounded-[18px] border border-[#d8ebdd] bg-white px-4 py-3 text-base text-[#1f3328] outline-none"
      />
    </label>
  );
}

function SummaryFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[18px] border border-[#d8ebdd] bg-[#f6fcf7] px-4 py-3">
      <span className="text-sm text-[#6b7c70]">{label}</span>
      <span className="text-right text-sm font-semibold text-[#1f3328]">{value}</span>
    </div>
  );
}
