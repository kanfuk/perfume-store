"use client";
import { useMemo, useState, useSyncExternalStore } from "react";
import { Building2, CalendarClock, Home, NotebookPen, Phone, Search, Sparkles, UserRound } from "lucide-react";
import Link from "next/link";
import { formatChileanMobileInput } from "@/lib/chile-phone";
import {
  normalizeCustomerDisplayName,
  normalizeCustomerLookupValue
} from "@/lib/customers/identity";
import { getChileTodayInputValue } from "@/lib/date";
import { formatCurrency } from "@/lib/format";
import { shouldDecreaseStock, getAvailableProductStock, normalizeStockValue } from "@/lib/stock";
import type {
  AdminCustomerOption,
  AdminDashboardData,
  AdminProductRecord
} from "@/lib/types";

type ExistingCustomer = {
  id: string;
  nombre: string;
  telefono: string;
  lugarTrabajo: string;
};

type AdminCustomOrderProps = {
  initialDashboard: AdminDashboardData;
  initialProducts: AdminProductRecord[];
  initialCustomers: AdminCustomerOption[];
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
  estadoInicial: "NUEVO" as "NUEVO" | "AGENDADO" | "PAGADO"
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

export function AdminCustomOrder({
  initialDashboard,
  initialProducts,
  initialCustomers
}: AdminCustomOrderProps) {
  const todayDate = useSyncExternalStore(
    subscribeToTodaySnapshot,
    getChileTodayInputValue,
    getEmptyTodaySnapshot
  );

  const products = useMemo(() => initialProducts, [initialProducts]);
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

  const [customForm, setCustomForm] = useState(initialCustomForm);
  const [customSelectedCustomerId, setCustomSelectedCustomerId] = useState("");
  const [customCustomerSearch, setCustomCustomerSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [customQuantityChoice, setCustomQuantityChoice] = useState("1");
  const [customManualQuantity, setCustomManualQuantity] = useState("");

  const customTotal =
    (Number(customForm.cantidad) || 0) * (Number(customForm.precioAcordado) || 0);
  const utilidadEstimada =
    customForm.costoEstimadoTotal.trim() && customTotal > 0
      ? customTotal - Number(customForm.costoEstimadoTotal)
      : null;
  const selectedCustomCatalogProduct = useMemo(
    () => products.find((product) => product.id === customForm.productoBaseId) ?? null,
    [customForm.productoBaseId, products]
  );

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
          descripcion: [
            customForm.descripcion.trim(),
            customForm.fechaEntrega
              ? `Fecha de entrega solicitada: ${customForm.fechaEntrega}`
              : undefined
          ]
            .filter(Boolean)
            .join(" | "),
          cantidad: Number(customForm.cantidad),
          precioAcordado: Number(customForm.precioAcordado),
          costoEstimadoTotal: customForm.costoEstimadoTotal.trim()
            ? Number(customForm.costoEstimadoTotal)
            : undefined,
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
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-[1600px] flex-col gap-6 overflow-x-hidden bg-[#f7f8fa] px-4 py-4 pb-[calc(88px+env(safe-area-inset-bottom))] sm:px-6 lg:px-8">
      <section className="overflow-hidden rounded-2xl bg-[#17191f] text-white shadow-[0_16px_36px_rgba(17,19,24,0.16)]">
        <div className="bg-[radial-gradient(circle_at_80%_20%,rgba(115,87,255,0.34),transparent_28%)] p-6 sm:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-4">
              <div className="flex w-fit items-center gap-3">
                <div className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-white">
                  <span className="text-lg font-bold text-[#17191f]">S</span>
                </div>
                <div className="space-y-1">
                  <span className="inline-flex w-fit items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#c8c0ff]">
                    <Sparkles className="h-3.5 w-3.5" />
                    Admin Smellme.cl
                  </span>
                  <p className="text-sm font-semibold text-white/60">Pedidos especiales fuera del catálogo</p>
                </div>
              </div>
              <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-[-0.04em] text-white sm:text-4xl">
                  Pedidos personalizados
                </h1>
                <p className="max-w-3xl text-sm leading-6 text-white/60 sm:text-base">
                  Registra pedidos especiales como queques enteros, preparaciones a pedido u otros productos.
                </p>
              </div>
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

      {successMessage ? (
        <div className="rounded-[24px] border border-brand-200 bg-brand-50 px-4 py-4 text-sm text-brand-800">
          {successMessage}
        </div>
      ) : null}
      {serverError ? (
        <div className="rounded-[24px] border border-brand-100 bg-brand-50 px-4 py-4 text-sm text-brand-800">
          {serverError}
        </div>
      ) : null}

      <section className="grid w-full max-w-full min-w-0 gap-6 pb-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <CardSection
            icon={<Sparkles className="h-5 w-5" />}
            title="Pedido personalizado"
            subtitle="Registra pedidos especiales como queques enteros, preparaciones a pedido u otros productos."
          >
            <div className="space-y-2">
              <span className="text-sm font-medium text-[#111318]">Cliente existente opcional</span>
              <label className="relative block">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#667085]" />
                <input
                  value={customCustomerSearch}
                  onChange={(event) => handleCustomCustomerSearchChange(event.target.value)}
                  placeholder="Busca por nombre, telefono o lugar de trabajo"
                  className="block min-h-11 w-full min-w-0 max-w-full rounded-[18px] border border-[#e4e7ec] bg-white py-3 pl-11 pr-4 text-base text-[#111318] outline-none"
                />
              </label>
              <select
                value={customSelectedCustomerId}
                onChange={(event) => syncCustomExistingCustomer(event.target.value)}
                className="block min-h-11 w-full min-w-0 max-w-full rounded-[18px] border border-[#e4e7ec] bg-white px-4 py-3 text-base text-[#111318]"
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
                <span className="text-sm font-medium text-[#111318]">Producto</span>
                <select
                  value={customForm.productoBaseId}
                  onChange={(event) => syncCustomProduct(event.target.value)}
                  className="block min-h-11 w-full min-w-0 max-w-full rounded-[18px] border border-[#e4e7ec] bg-white px-4 py-3 text-base text-[#111318]"
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
                <span className="text-sm font-medium text-[#111318]">Cantidad</span>
                <select
                  value={customQuantityChoice}
                  onChange={(event) => syncCustomQuantityChoice(event.target.value)}
                  className="block min-h-11 w-full min-w-0 max-w-full rounded-[18px] border border-[#e4e7ec] bg-white px-4 py-3 text-base text-[#111318]"
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
                <span className="text-sm font-medium text-[#111318]">Otra cantidad</span>
                <input
                  type="number"
                  min={1}
                  value={customManualQuantity}
                  onChange={(event) => syncCustomManualQuantity(event.target.value)}
                  placeholder="Ejemplo: 7"
                  className="block min-h-11 w-full min-w-0 max-w-full rounded-[18px] border border-[#e4e7ec] bg-white px-4 py-3 text-base text-[#111318] outline-none"
                />
              </label>
            ) : null}
            {selectedCustomCatalogProduct ? (
              <div className="rounded-[18px] border border-[#e4e7ec] bg-[#f7f8fa] px-4 py-3 text-sm text-[#667085]">
                <strong className="text-[#111318]">{selectedCustomCatalogProduct.nombre}</strong>
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
              <div className="rounded-[18px] border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">
                Este pedido se asociara al cliente existente {matchedCustomCustomer.nombre}.
              </div>
            ) : normalizedCustomCustomerName ? (
              <div className="rounded-[18px] border border-dashed border-[#e4e7ec] bg-[#f7f8fa] px-4 py-3 text-sm text-[#667085]">
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
                <span className="text-sm font-medium text-[#111318]">
                  Fecha de entrega opcional
                </span>
                <div className="flex items-center gap-3 rounded-[18px] border border-[#e4e7ec] bg-white px-4 py-3">
                  <span className="text-[#667085]">
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
                    className="w-full min-w-0 border-0 bg-transparent p-0 text-base text-[#111318] outline-none"
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
                    className="shrink-0 rounded-xl border border-[#e4e7ec] bg-[#f7f8fa] px-3 py-2 text-sm font-semibold text-[#5434e6]"
                  >
                    Hoy
                  </button>
                </div>
              </label>
            </div>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-[#111318]">Descripción / observación</span>
              <textarea
                value={customForm.descripcion}
                onChange={(event) =>
                  setCustomForm((current) => ({ ...current, descripcion: event.target.value }))
                }
                rows={4}
                className="w-full rounded-[18px] border border-[#e4e7ec] bg-white px-4 py-3 text-base text-[#111318] outline-none"
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
              <div className="text-sm font-medium text-[#111318]">Estado inicial del pedido</div>
              <div className="grid gap-3 sm:auto-rows-fr sm:grid-cols-3">
                <ChoiceButton
                  active={customForm.estadoInicial === "NUEVO"}
                  title="Nuevo"
                  text="Queda NUEVO / SIN_PAGO."
                  onClick={() =>
                    setCustomForm((current) => ({ ...current, estadoInicial: "NUEVO" }))
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
                  text="Queda PAGADO / PAGADO."
                  onClick={() =>
                    setCustomForm((current) => ({ ...current, estadoInicial: "PAGADO" }))
                  }
                />
              </div>
            </div>
          </CardSection>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-6 xl:h-fit">
          <div className="rounded-[30px] border border-[#e4e7ec] bg-white/95 p-5 shadow-soft">
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-[#111318]">Resumen antes de guardar</h3>
                <p className="mt-1 text-sm text-[#667085]">
                  Cliente, producto, total y estado en una sola vista.
                </p>
              </div>

              <SummaryFact label="Cliente" value={customForm.nombre || "Sin nombre"} />
              <SummaryFact label="Producto" value={customForm.nombreProducto || "Sin definir"} />
              <SummaryFact
                label="Tipo"
                value={customForm.productoBaseId ? "Vinculada a catálogo" : "Personalizada libre"}
              />
              <SummaryFact label="Cantidad" value={customForm.cantidad || "0"} />
              <SummaryFact label="Total" value={formatCurrency(customTotal)} />
              <SummaryFact
                label="Estado"
                value={
                  customForm.estadoInicial === "NUEVO"
                    ? "NUEVO / SIN_PAGO"
                    : customForm.estadoInicial === "AGENDADO"
                    ? "AGENDADO / SIN_PAGO"
                    : "PAGADO / PAGADO"
                }
              />
              <SummaryFact
                label="Utilidad estimada"
                value={utilidadEstimada === null ? "No calculada" : formatCurrency(utilidadEstimada)}
              />

              <button
                type="button"
                disabled={submitting}
                onClick={() => void submitCustomOrder()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-[24px] bg-brand-600 px-4 py-4 text-base font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-brand-200"
              >
                <Sparkles className="h-5 w-5" />
                {submitting ? "Registrando pedido..." : "Registrar pedido personalizado"}
              </button>
            </div>
          </div>
        </aside>
      </section>

      <Link
        href="/admin"
        className="fixed bottom-[calc(24px+env(safe-area-inset-bottom))] right-4 z-40 inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#e4e7ec] bg-white/95 text-[#667085] shadow-soft backdrop-blur md:hidden"
        aria-label="Inicio admin"
      >
        <Home className="h-4 w-4" />
      </Link>
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
    <section className="space-y-4 rounded-[30px] border border-[#e4e7ec] bg-white/95 p-5 shadow-soft backdrop-blur sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#7357ff] shadow-sm">
          {icon}
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[#111318]">{title}</h2>
          <p className="copy-justified text-sm text-[#667085]">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
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
        active ? "border-brand-200 bg-brand-50 shadow-soft" : "border-[#e4e7ec] bg-white"
      }`}
    >
      <div className="font-semibold text-[#111318]">{title}</div>
      <div className="mt-1 text-sm leading-6 text-[#667085]">{text}</div>
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
      <span className="text-sm font-medium text-[#111318]">{label}</span>
      <div className="flex items-center gap-3 rounded-[18px] border border-[#e4e7ec] bg-white px-4 py-3">
        <span className="text-[#667085]">{icon}</span>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="w-full min-w-0 border-0 bg-transparent p-0 text-base text-[#111318] outline-none placeholder:text-[#667085]"
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
      <span className="text-sm font-medium text-[#111318]">{label}</span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="block min-h-11 w-full min-w-0 max-w-full rounded-[18px] border border-[#e4e7ec] bg-white px-4 py-3 text-base text-[#111318] outline-none"
      />
    </label>
  );
}

function SummaryFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[18px] border border-[#e4e7ec] bg-[#f7f8fa] px-4 py-3">
      <span className="text-sm text-[#667085]">{label}</span>
      <span className="text-right text-sm font-semibold text-[#111318]">{value}</span>
    </div>
  );
}
