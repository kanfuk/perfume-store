"use client";

import { useMemo, useState } from "react";
import {
  BadgeCheck,
  Building2,
  CalendarClock,
  Home,
  NotebookPen,
  Phone,
  ShoppingBag,
  Sparkles,
  UserRound
} from "lucide-react";
import Link from "next/link";
import { CartSummary } from "@/components/shared/CartSummary";
import { ProductCatalog } from "@/components/shared/ProductCatalog";
import { WhatsAppFloatingButton } from "@/components/shared/WhatsAppFloatingButton";
import { formatChileanMobileInput } from "@/lib/chile-phone";
import { formatCurrency } from "@/lib/format";
import { calcularTotalPedido, normalizarProductoParaCarrito } from "@/lib/order-helpers";
import type { AdminDashboardData, AdminProductRecord } from "@/lib/types";

type Mode = "catalogo" | "personalizado";

type AdminDirectSaleProps = {
  initialDashboard: AdminDashboardData;
  initialProducts: AdminProductRecord[];
};

type ExistingCustomer = {
  key: string;
  nombre: string;
  telefono: string;
  lugarTrabajo: string;
};

const initialCustomForm = {
  nombre: "",
  telefono: "",
  lugarTrabajo: "",
  nombreProducto: "",
  descripcion: "",
  cantidad: "1",
  precioAcordado: "",
  costoEstimadoTotal: "",
  fechaEntrega: "",
  estadoInicial: "AGENDADO" as "AGENDADO" | "PAGADO" | "FIADO"
};

export function AdminDirectSale({
  initialDashboard,
  initialProducts
}: AdminDirectSaleProps) {
  const products = useMemo(
    () =>
      initialProducts
        .filter((product) => product.activo)
        .map((product) => ({
          ...product,
          stockActual: product.stockActual,
          stockAgenda: product.stockAgenda
        })),
    [initialProducts]
  );
  const customers = useMemo(() => {
    const map = new Map<string, ExistingCustomer>();
    const allOrders = [
      ...initialDashboard.pendientes,
      ...initialDashboard.agendados,
      ...initialDashboard.finalizados,
      ...initialDashboard.cancelados
    ];

    allOrders.forEach((order) => {
      const key = order.clienteTelefono || `${order.clienteNombre}__${order.clienteLugarTrabajo}`;

      if (!map.has(key)) {
        map.set(key, {
          key,
          nombre: order.clienteNombre,
          telefono: order.clienteTelefono,
          lugarTrabajo: order.clienteLugarTrabajo
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [initialDashboard]);

  const [mode, setMode] = useState<Mode>("catalogo");
  const [saleItems, setSaleItems] = useState<Array<{ productoId: string; cantidad: number }>>([]);
  const [customerMode, setCustomerMode] = useState<"ocasional" | "existente" | "nuevo">(
    "ocasional"
  );
  const [selectedCustomerKey, setSelectedCustomerKey] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerPlace, setCustomerPlace] = useState("");
  const [paymentState, setPaymentState] = useState<"PAGADO" | "FIADO">("PAGADO");
  const [catalogNote, setCatalogNote] = useState("");
  const [customForm, setCustomForm] = useState(initialCustomForm);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const cartLines = useMemo(
    () => normalizarProductoParaCarrito(saleItems, products),
    [products, saleItems]
  );
  const total = calcularTotalPedido(cartLines);
  const quantities = useMemo(
    () => Object.fromEntries(saleItems.map((item) => [item.productoId, item.cantidad])),
    [saleItems]
  );
  const customTotal =
    (Number(customForm.cantidad) || 0) * (Number(customForm.precioAcordado) || 0);
  const utilidadEstimada =
    customForm.costoEstimadoTotal.trim() && customTotal > 0
      ? customTotal - Number(customForm.costoEstimadoTotal)
      : null;

  function syncExistingCustomer(customerKey: string) {
    setSelectedCustomerKey(customerKey);
    const customer = customers.find((item) => item.key === customerKey);

    if (!customer) {
      return;
    }

    setCustomerName(customer.nombre);
    setCustomerPhone(customer.telefono);
    setCustomerPlace(customer.lugarTrabajo);
  }

  function addProduct(productId: string) {
    setSaleItems((current) => {
      const existing = current.find((item) => item.productoId === productId);
      const product = products.find((item) => item.id === productId);

      if (!product) {
        return current;
      }

      const nextQuantity = (existing?.cantidad ?? 0) + 1;

      if (nextQuantity > (product.stockActual ?? 0)) {
        return current;
      }

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

      const quantity = Math.min(nextQuantity, product.stockActual ?? 0);

      return current.map((item) =>
        item.productoId === productId ? { ...item, cantidad: quantity } : item
      );
    });
  }

  async function submitDirectSale() {
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
      setSelectedCustomerKey("");
      setCustomerName("");
      setCustomerPhone("");
      setCustomerPlace("");
      setPaymentState("PAGADO");
      setSuccessMessage(
        `Venta directa registrada correctamente. Codigo interno: ${data.pedidoId ?? "OK"}.`
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
          nombre: customForm.nombre,
          telefono: customForm.telefono,
          lugarTrabajo: customForm.lugarTrabajo,
          nombreProducto: customForm.nombreProducto,
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
      setSuccessMessage(
        `Pedido personalizado registrado correctamente. Codigo interno: ${data.pedidoId ?? "OK"}.`
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
      <section className="overflow-hidden rounded-[34px] border border-[#ecd7b3] bg-white/92 shadow-soft">
        <div className="bg-[linear-gradient(140deg,#fff4da_0%,#f8d8cb_48%,#fdecef_100%)] p-6 sm:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-sm font-semibold text-[#8f5728]">
                <ShoppingBag className="h-4 w-4" />
                Admin Pauli Store
              </span>
              <div className="space-y-2">
                <h1 className="text-3xl font-bold text-[#6f3146] sm:text-4xl">
                  Venta directa
                </h1>
                <p className="max-w-3xl text-sm leading-6 text-[#7e4a5c] sm:text-base">
                  Registra ventas realizadas en el momento sin usar el formulario publico.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/admin"
                className="inline-flex min-h-[56px] min-w-[132px] items-center justify-center gap-2 rounded-[20px] border border-[#ecd7b3] bg-white/80 px-4 py-3 text-center text-sm font-semibold text-[#7e4a5c] sm:min-w-[146px]"
              >
                <Home className="h-4 w-4" />
                <span className="hidden sm:inline">Inicio</span>
              </Link>
              <ModeButton
                active={mode === "catalogo"}
                icon={<ShoppingBag className="h-4 w-4" />}
                label="Catalogo"
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
        <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-800">
          {serverError}
        </div>
      ) : null}

      {mode === "catalogo" ? (
        <section className="grid w-full max-w-full min-w-0 gap-6 pb-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <CardSection
              icon={<ShoppingBag className="h-5 w-5" />}
              title="Catalogo activo"
              subtitle="Usa las mismas tarjetas del cliente para vender rapido desde el celular."
            >
              <ProductCatalog
                products={products}
                quantities={quantities}
                onAdd={addProduct}
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
                  text="Venta rapida sin completar todo."
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
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-[#5f3041]">Cliente existente</span>
                  <select
                    value={selectedCustomerKey}
                    onChange={(event) => syncExistingCustomer(event.target.value)}
                    className="block min-h-11 w-full min-w-0 max-w-full rounded-[18px] border border-[#f0d6da] bg-white px-4 py-3 text-base text-[#5f3041]"
                  >
                    <option value="">Selecciona cliente</option>
                    {customers.map((customer) => (
                      <option key={customer.key} value={customer.key}>
                        {customer.nombre} {customer.lugarTrabajo ? `- ${customer.lugarTrabajo}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                <TextField
                  label="Nombre cliente opcional"
                  value={customerName}
                  onChange={setCustomerName}
                  placeholder="Ejemplo: Paola"
                  icon={<UserRound className="h-4 w-4" />}
                />
                <TextField
                  label="Telefono opcional"
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
                placeholder="Ejemplo: Recepcion o piso 3"
                icon={<Building2 className="h-4 w-4" />}
              />

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
                <span className="text-sm font-medium text-[#5f3041]">Nota interna opcional</span>
                <textarea
                  value={catalogNote}
                  onChange={(event) => setCatalogNote(event.target.value)}
                  rows={3}
                  className="w-full rounded-[18px] border border-[#f0d6da] bg-white px-4 py-3 text-base text-[#5f3041] outline-none"
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
              emptyText="El resumen aparecera apenas elijas productos del catalogo."
              title="Resumen de venta"
              subtitle="Mismo calculo del cliente, pero listo para cerrar al instante."
            />

            <div className="rounded-[30px] border border-[#ecd7b3] bg-white/95 p-5 shadow-soft">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fff6e7] text-[#a86b32]">
                    <BadgeCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-[#5f3041]">
                      Registrar venta
                    </h3>
                    <p className="text-sm text-[#7f5b67]">
                      La venta se guardara como FINALIZADO/{paymentState}.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={submitting || saleItems.length === 0}
                  onClick={() => void submitDirectSale()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-[24px] bg-[#a86b32] px-4 py-4 text-base font-semibold text-white transition hover:bg-[#8f5728] disabled:cursor-not-allowed disabled:bg-[#d7b894]"
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
              <div className="grid gap-4 md:grid-cols-2">
                <TextField
                  label="Nombre cliente"
                  value={customForm.nombre}
                  onChange={(value) => setCustomForm((current) => ({ ...current, nombre: value }))}
                  placeholder="Ejemplo: Claudia"
                  icon={<UserRound className="h-4 w-4" />}
                />
                <TextField
                  label="Telefono opcional"
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
                <TextField
                  label="Fecha de entrega opcional"
                  value={customForm.fechaEntrega}
                  onChange={(value) =>
                    setCustomForm((current) => ({ ...current, fechaEntrega: value }))
                  }
                  placeholder="2026-06-20"
                  icon={<CalendarClock className="h-4 w-4" />}
                />
              </div>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-[#5f3041]">Descripcion / observacion</span>
                <textarea
                  value={customForm.descripcion}
                  onChange={(event) =>
                    setCustomForm((current) => ({ ...current, descripcion: event.target.value }))
                  }
                  rows={4}
                  className="w-full rounded-[18px] border border-[#f0d6da] bg-white px-4 py-3 text-base text-[#5f3041] outline-none"
                  placeholder="Detalles del pedido, sabores, relleno o instrucciones."
                />
              </label>

              <div className="grid gap-4 md:grid-cols-3">
                <NumberField
                  label="Cantidad"
                  value={customForm.cantidad}
                  onChange={(value) =>
                    setCustomForm((current) => ({ ...current, cantidad: value }))
                  }
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
                <div className="text-sm font-medium text-[#5f3041]">Estado inicial del pedido</div>
                <div className="grid gap-3 sm:auto-rows-fr sm:grid-cols-3">
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
            <div className="rounded-[30px] border border-[#ecd7b3] bg-white/95 p-5 shadow-soft">
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-[#5f3041]">Resumen antes de guardar</h3>
                  <p className="mt-1 text-sm text-[#7f5b67]">
                    Cliente, producto, total y estado en una sola vista.
                  </p>
                </div>

                <SummaryFact label="Cliente" value={customForm.nombre || "Sin nombre"} />
                <SummaryFact
                  label="Producto"
                  value={customForm.nombreProducto || "Sin definir"}
                />
                <SummaryFact label="Cantidad" value={customForm.cantidad || "0"} />
                <SummaryFact label="Total" value={formatCurrency(customTotal)} />
                <SummaryFact
                  label="Estado"
                  value={
                    customForm.estadoInicial === "AGENDADO"
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
                  className="inline-flex w-full items-center justify-center gap-2 rounded-[24px] bg-[#a86b32] px-4 py-4 text-base font-semibold text-white transition hover:bg-[#8f5728] disabled:cursor-not-allowed disabled:bg-[#d7b894]"
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
        className="fixed bottom-[calc(24px+env(safe-area-inset-bottom))] right-4 z-40 inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#ecd7b3] bg-white/95 text-[#7e4a5c] shadow-soft backdrop-blur md:hidden"
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
    <section className="space-y-4 rounded-[30px] border border-[#ecd7b3] bg-white/95 p-5 shadow-soft backdrop-blur sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#a86b32] shadow-sm">
          {icon}
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[#5f3041]">{title}</h2>
          <p className="copy-justified text-sm text-[#7f5b67]">{subtitle}</p>
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
          ? "bg-[#a86b32] text-white"
          : "border border-[#ecd7b3] bg-white/80 text-[#7e4a5c]"
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
          ? "border-[#a86b32] bg-[#fff6e7] shadow-soft"
          : "border-[#eedcc3] bg-white"
      }`}
    >
      <div className="font-semibold text-[#5f3041]">{title}</div>
      <div className="mt-1 text-sm leading-6 text-[#7f5b67]">{text}</div>
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
      <span className="text-sm font-medium text-[#5f3041]">{label}</span>
      <div className="flex items-center gap-3 rounded-[18px] border border-[#f0d6da] bg-white px-4 py-3">
        <span className="text-[#b797a2]">{icon}</span>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="w-full min-w-0 border-0 bg-transparent p-0 text-base text-[#5f3041] outline-none placeholder:text-[#b797a2]"
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
      <span className="text-sm font-medium text-[#5f3041]">{label}</span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="block min-h-11 w-full min-w-0 max-w-full rounded-[18px] border border-[#f0d6da] bg-white px-4 py-3 text-base text-[#5f3041] outline-none"
      />
    </label>
  );
}

function SummaryFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[18px] border border-[#eedcc3] bg-[#fff9ef] px-4 py-3">
      <span className="text-sm text-[#7f5b67]">{label}</span>
      <span className="text-right text-sm font-semibold text-[#5f3041]">{value}</span>
    </div>
  );
}
