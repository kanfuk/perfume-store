"use client";

import { useMemo, useState } from "react";
import { formatCurrency } from "@/lib/format";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type {
  AdminDashboardData,
  AdminOrderSummary,
  AdminPageData,
  AdminProductRecord
} from "@/lib/types";

type AdminAction = "agendar" | "cancelar" | "pagado" | "fiado" | "abonar";
type StatusFilter =
  | "todos"
  | "pendientes"
  | "agendados"
  | "fiados"
  | "finalizados"
  | "cancelados";
type OrderModalState =
  | { type: "cancelar"; order: AdminOrderSummary }
  | { type: "abonar"; order: AdminOrderSummary }
  | null;
type ProductModalState =
  | { mode: "create" }
  | { mode: "edit"; product: AdminProductRecord }
  | null;

const statusOptions: Array<{ value: StatusFilter; label: string }> = [
  { value: "todos", label: "Todas las vistas" },
  { value: "pendientes", label: "Pendientes" },
  { value: "agendados", label: "Agendados" },
  { value: "fiados", label: "Fiados pendientes" },
  { value: "finalizados", label: "Finalizados" },
  { value: "cancelados", label: "Cancelados" }
];

type AdminDashboardProps = {
  initialData: AdminPageData;
};

export function AdminDashboard({ initialData }: AdminDashboardProps) {
  const [data, setData] = useState<AdminDashboardData>(initialData.dashboard);
  const [products, setProducts] = useState<AdminProductRecord[]>(initialData.productos);
  const [loading, setLoading] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [error, setError] = useState("");
  const [busyOrderId, setBusyOrderId] = useState("");
  const [busyProductId, setBusyProductId] = useState("");
  const [search, setSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [selectedOrderId, setSelectedOrderId] = useState(
    initialData.dashboard.pendientes[0]?.id ??
      initialData.dashboard.agendados[0]?.id ??
      initialData.dashboard.fiadosPendientes[0]?.id ??
      initialData.dashboard.finalizados[0]?.id ??
      initialData.dashboard.cancelados[0]?.id ??
      ""
  );
  const [orderModalState, setOrderModalState] = useState<OrderModalState>(null);
  const [productModalState, setProductModalState] = useState<ProductModalState>(null);

  const allOrders = useMemo(
    () => [
      ...data.pendientes,
      ...data.agendados,
      ...data.fiadosPendientes,
      ...data.finalizados,
      ...data.cancelados
    ],
    [data]
  );

  const selectedOrder =
    allOrders.find((order) => order.id === selectedOrderId) ?? allOrders[0] ?? null;

  const normalizedSearch = search.trim().toLowerCase();
  const normalizedProductSearch = productSearch.trim().toLowerCase();

  const filteredData = useMemo(() => {
    function matches(order: AdminOrderSummary) {
      if (!normalizedSearch) {
        return true;
      }

      const haystack = [
        order.clienteNombre,
        order.clienteTelefono,
        order.clienteLugarTrabajo,
        order.productoNombre,
        order.estadoPedido,
        order.estadoPago
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    }

    return {
      pendientes: data.pendientes.filter(matches),
      agendados: data.agendados.filter(matches),
      fiadosPendientes: data.fiadosPendientes.filter(matches),
      finalizados: data.finalizados.filter(matches),
      cancelados: data.cancelados.filter(matches)
    };
  }, [data, normalizedSearch]);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      if (!normalizedProductSearch) {
        return true;
      }

      return [
        product.nombre,
        product.descripcion,
        product.tipoProducto,
        product.activo ? "activo" : "inactivo"
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedProductSearch);
    });
  }, [normalizedProductSearch, products]);

  const resumen = useMemo(
    () => [
      { label: "Pendientes", value: data.pendientes.length.toString() },
      { label: "Agendados", value: data.agendados.length.toString() },
      {
        label: "Fiados por cobrar",
        value: formatCurrency(
          data.fiadosPendientes.reduce((sum, order) => sum + order.saldoPendiente, 0)
        )
      },
      {
        label: "Ventas cerradas",
        value: formatCurrency(
          data.finalizados.reduce((sum, order) => sum + order.totalPagado, 0)
        )
      }
    ],
    [data]
  );

  async function loadOrders() {
    try {
      setLoading(true);
      const response = await fetch("/api/admin/orders", { cache: "no-store" });
      const currentData = (await response.json()) as AdminDashboardData & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(currentData.error ?? "No fue posible cargar pedidos.");
      }

      setData(currentData);
    } catch (currentError) {
      setError(
        currentError instanceof Error
          ? currentError.message
          : "No fue posible cargar pedidos."
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadProducts() {
    try {
      setCatalogLoading(true);
      const response = await fetch("/api/admin/products", { cache: "no-store" });
      const currentData = (await response.json()) as {
        products?: AdminProductRecord[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(currentData.error ?? "No fue posible cargar productos.");
      }

      setProducts(currentData.products ?? []);
    } catch (currentError) {
      setError(
        currentError instanceof Error
          ? currentError.message
          : "No fue posible cargar productos."
      );
    } finally {
      setCatalogLoading(false);
    }
  }

  async function runAction(
    pedidoId: string,
    action: AdminAction,
    payload?: { motivoCancelacion?: string; monto?: number; metodoPago?: string }
  ) {
    try {
      setBusyOrderId(pedidoId);
      setError("");
      const response = await fetch(`/api/admin/orders/${pedidoId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action,
          ...payload
        })
      });

      const currentData = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(currentData.error ?? "No fue posible actualizar el pedido.");
      }

      setOrderModalState(null);
      await loadOrders();
    } catch (currentError) {
      setError(
        currentError instanceof Error
          ? currentError.message
          : "No fue posible actualizar el pedido."
      );
    } finally {
      setBusyOrderId("");
    }
  }

  async function saveProduct(payload: {
    id?: string;
    nombre: string;
    descripcion: string;
    precioVenta: number;
    costoUnitario: number;
    stockActual: number;
    tipoProducto: string;
    activo: boolean;
  }) {
    try {
      setBusyProductId(payload.id ?? "new");
      setError("");
      const url = payload.id
        ? `/api/admin/products/${payload.id}`
        : "/api/admin/products";
      const method = payload.id ? "PATCH" : "POST";
      const body = payload.id
        ? JSON.stringify({ mode: "update", ...payload })
        : JSON.stringify(payload);
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json"
        },
        body
      });
      const currentData = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(currentData.error ?? "No fue posible guardar el producto.");
      }

      setProductModalState(null);
      await loadProducts();
    } catch (currentError) {
      setError(
        currentError instanceof Error
          ? currentError.message
          : "No fue posible guardar el producto."
      );
    } finally {
      setBusyProductId("");
    }
  }

  async function toggleProduct(product: AdminProductRecord) {
    try {
      setBusyProductId(product.id);
      setError("");
      const response = await fetch(`/api/admin/products/${product.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          mode: "toggle",
          activo: !product.activo
        })
      });
      const currentData = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(currentData.error ?? "No fue posible cambiar el estado.");
      }

      await loadProducts();
    } catch (currentError) {
      setError(
        currentError instanceof Error
          ? currentError.message
          : "No fue posible cambiar el estado."
      );
    } finally {
      setBusyProductId("");
    }
  }

  async function logout() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/admin/login";
  }

  const sections: Array<{
    key: string;
    title: string;
    subtitle: string;
    orders: AdminOrderSummary[];
    visible: boolean;
    emptyText: string;
    actions: Array<{
      key: AdminAction;
      label: string;
      tone: "primary" | "warning" | "muted";
    }>;
  }> = [
    {
      key: "pendientes",
      title: "Pedidos pendientes",
      subtitle: "Entradas nuevas esperando confirmacion.",
      orders: filteredData.pendientes,
      visible: statusFilter === "todos" || statusFilter === "pendientes",
      emptyText: "No hay pedidos pendientes.",
      actions: [
        { key: "agendar", label: "Agendar", tone: "primary" },
        { key: "cancelar", label: "Cancelar", tone: "muted" }
      ]
    },
    {
      key: "agendados",
      title: "Pedidos agendados",
      subtitle: "Listos para cerrar como pagados o fiados.",
      orders: filteredData.agendados,
      visible: statusFilter === "todos" || statusFilter === "agendados",
      emptyText: "No hay pedidos agendados.",
      actions: [
        { key: "pagado", label: "Marcar pagado", tone: "primary" },
        { key: "fiado", label: "Marcar fiado", tone: "warning" },
        { key: "cancelar", label: "Cancelar", tone: "muted" }
      ]
    },
    {
      key: "fiados",
      title: "Fiados pendientes",
      subtitle: "Control de deuda y abonos parciales.",
      orders: filteredData.fiadosPendientes,
      visible: statusFilter === "todos" || statusFilter === "fiados",
      emptyText: "No hay fiados pendientes.",
      actions: [{ key: "abonar", label: "Registrar abono", tone: "warning" }]
    },
    {
      key: "finalizados",
      title: "Finalizados recientes",
      subtitle: "Pedidos cerrados y pagos consolidados.",
      orders: filteredData.finalizados,
      visible: statusFilter === "todos" || statusFilter === "finalizados",
      emptyText: "No hay pedidos finalizados.",
      actions: []
    },
    {
      key: "cancelados",
      title: "Cancelados recientes",
      subtitle: "Historial de pedidos anulados.",
      orders: filteredData.cancelados,
      visible: statusFilter === "todos" || statusFilter === "cancelados",
      emptyText: "No hay pedidos cancelados.",
      actions: []
    }
  ];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6">
      <section className="flex flex-col gap-4 rounded-lg border border-border bg-panel p-6 shadow-soft sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <span className="inline-flex rounded-full bg-secondary px-3 py-1 text-sm font-semibold text-ink">
            Panel admin
          </span>
          <h1 className="text-3xl font-bold text-ink">Gestion de pedidos y catalogo</h1>
          <p className="max-w-2xl text-sm leading-6 text-ink/75">
            Seguimiento diario de agenda, cobros, fiados y administracion de
            productos con sus precios desde un solo panel.
          </p>
        </div>

        <button
          type="button"
          onClick={logout}
          className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-ink"
        >
          Cerrar sesion
        </button>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {resumen.map((item) => (
          <div
            key={item.label}
            className="rounded-lg border border-border bg-panel p-5 shadow-soft"
          >
            <div className="text-sm text-ink/70">{item.label}</div>
            <div className="mt-2 text-2xl font-semibold text-ink">{item.value}</div>
          </div>
        ))}
      </section>

      <section className="grid gap-4 rounded-lg border border-border bg-panel p-4 shadow-soft lg:grid-cols-[minmax(0,1fr)_220px]">
        <label className="space-y-2">
          <span className="text-sm font-medium text-ink">Buscar pedido</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cliente, telefono, lugar, producto o estado"
            className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm text-ink"
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-ink">Vista</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm text-ink"
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      {error ? (
        <div className="rounded-lg border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
          {error}
        </div>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.8fr)_minmax(320px,0.9fr)]">
        <div className="space-y-6">
          {sections
            .filter((section) => section.visible)
            .map((section) => (
              <OrderSection
                key={section.key}
                title={section.title}
                subtitle={section.subtitle}
                orders={section.orders}
                loading={loading}
                emptyText={section.emptyText}
                busyOrderId={busyOrderId}
                selectedOrderId={selectedOrderId}
                actions={section.actions}
                onSelect={setSelectedOrderId}
                onAction={(order, action) => {
                  if (action === "cancelar") {
                    setOrderModalState({ type: "cancelar", order });
                    return;
                  }

                  if (action === "abonar") {
                    setOrderModalState({ type: "abonar", order });
                    return;
                  }

                  void runAction(order.id, action);
                }}
              />
            ))}
        </div>

        <aside className="rounded-lg border border-border bg-panel p-5 shadow-soft xl:sticky xl:top-6 xl:h-fit">
          <OrderDetailPanel order={selectedOrder} />
        </aside>
      </section>

      <section className="rounded-lg border border-border bg-panel p-5 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold text-ink">Catalogo de productos</h2>
            <p className="text-sm text-ink/70">
              Define productos, precios, costos, stock y si estan visibles para el
              cliente.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              value={productSearch}
              onChange={(event) => setProductSearch(event.target.value)}
              placeholder="Buscar producto, tipo o estado"
              className="rounded-lg border border-border bg-background px-4 py-3 text-sm text-ink"
            />
            <button
              type="button"
              onClick={() => setProductModalState({ mode: "create" })}
              className="rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white"
            >
              Nuevo producto
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {catalogLoading ? (
            <p className="text-sm text-ink/70">Cargando catalogo...</p>
          ) : null}
          {!catalogLoading && filteredProducts.length === 0 ? (
            <p className="text-sm text-ink/70">No hay productos para esta busqueda.</p>
          ) : null}
          {filteredProducts.map((product) => (
            <article
              key={product.id}
              className="rounded-lg border border-border bg-background p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-ink">{product.nombre}</h3>
                    <StatusBadge
                      tone={product.activo ? "pedido" : "neutral"}
                      label={product.activo ? "ACTIVO" : "INACTIVO"}
                    />
                  </div>
                  <p className="text-sm text-ink/70">{product.descripcion || "Sin descripcion"}</p>
                  <p className="text-xs uppercase tracking-wide text-ink/55">
                    {product.tipoProducto}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setProductModalState({ mode: "edit", product })}
                  className="rounded-lg border border-border bg-panel px-3 py-2 text-sm font-medium text-ink"
                >
                  Editar
                </button>
              </div>

              <dl className="mt-4 grid gap-3 text-sm text-ink/80 sm:grid-cols-2">
                <InfoItem label="Precio venta" value={formatCurrency(product.precioVenta)} />
                <InfoItem label="Costo" value={formatCurrency(product.costoUnitario)} />
                <InfoItem label="Utilidad" value={formatCurrency(product.utilidadUnitaria)} />
                <InfoItem label="Stock" value={String(product.stockActual)} />
              </dl>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busyProductId === product.id}
                  onClick={() => void toggleProduct(product)}
                  className={buttonToneClass(product.activo ? "muted" : "primary")}
                >
                  {busyProductId === product.id
                    ? "Guardando..."
                    : product.activo
                      ? "Desactivar"
                      : "Activar"}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {orderModalState ? (
        <AdminActionModal
          state={orderModalState}
          busy={busyOrderId === orderModalState.order.id}
          onClose={() => setOrderModalState(null)}
          onConfirm={(payload) => {
            if (orderModalState.type === "cancelar") {
              void runAction(orderModalState.order.id, "cancelar", payload);
              return;
            }

            void runAction(orderModalState.order.id, "abonar", payload);
          }}
        />
      ) : null}

      {productModalState ? (
        <ProductModal
          state={productModalState}
          busy={busyProductId === (productModalState.mode === "edit" ? productModalState.product.id : "new")}
          onClose={() => setProductModalState(null)}
          onSave={saveProduct}
        />
      ) : null}
    </main>
  );
}

type OrderSectionProps = {
  title: string;
  subtitle: string;
  orders: AdminOrderSummary[];
  loading: boolean;
  emptyText: string;
  busyOrderId: string;
  selectedOrderId: string;
  actions: Array<{
    key: AdminAction;
    label: string;
    tone: "primary" | "warning" | "muted";
  }>;
  onSelect: (orderId: string) => void;
  onAction: (order: AdminOrderSummary, action: AdminAction) => void;
};

function OrderSection({
  title,
  subtitle,
  orders,
  loading,
  emptyText,
  busyOrderId,
  selectedOrderId,
  actions,
  onSelect,
  onAction
}: OrderSectionProps) {
  return (
    <section className="rounded-lg border border-border bg-panel p-5 shadow-soft">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold text-ink">{title}</h2>
        <p className="text-sm text-ink/70">{subtitle}</p>
      </div>

      <div className="mt-5 space-y-4">
        {loading ? <p className="text-sm text-ink/70">Cargando pedidos...</p> : null}
        {!loading && orders.length === 0 ? (
          <p className="text-sm text-ink/70">{emptyText}</p>
        ) : null}
        {orders.map((order) => (
          <article
            key={order.id}
            className={`space-y-4 rounded-lg border p-4 transition ${
              selectedOrderId === order.id
                ? "border-primary bg-white shadow-soft"
                : "border-border bg-background"
            }`}
          >
            <button
              type="button"
              onClick={() => onSelect(order.id)}
              className="w-full text-left"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-ink">
                    {order.clienteNombre}
                  </h3>
                  <p className="text-sm text-ink/70">
                    {order.items.length > 1
                      ? `${order.items.length} productos en el pedido`
                      : order.productoNombre}
                  </p>
                  <p className="text-sm text-ink/70">
                    {order.clienteLugarTrabajo || "Sin lugar de trabajo"}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <StatusBadge tone="pedido" label={order.estadoPedido} />
                  <StatusBadge
                    tone={order.estadoPago === "FIADO" ? "warning" : "neutral"}
                    label={order.estadoPago}
                  />
                </div>
              </div>

              <dl className="mt-4 grid gap-3 text-sm text-ink/80 sm:grid-cols-3">
                <InfoItem label="Cantidad" value={String(order.cantidad)} />
                <InfoItem label="Total" value={formatCurrency(order.total)} />
                <InfoItem label="Saldo" value={formatCurrency(order.saldoPendiente || 0)} />
              </dl>
            </button>

            {actions.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {actions.map((action) => (
                  <button
                    key={action.key}
                    type="button"
                    disabled={busyOrderId === order.id}
                    onClick={() => onAction(order, action.key)}
                    className={buttonToneClass(action.tone)}
                  >
                    {busyOrderId === order.id ? "Procesando..." : action.label}
                  </button>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function OrderDetailPanel({ order }: { order: AdminOrderSummary | null }) {
  if (!order) {
    return (
      <div className="flex min-h-[280px] items-center justify-center rounded-lg border border-dashed border-border bg-background p-6 text-sm text-ink/70">
        Selecciona un pedido para ver detalle, estado financiero y trazabilidad.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-ink">{order.clienteNombre}</h2>
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone="pedido" label={order.estadoPedido} />
          <StatusBadge
            tone={order.estadoPago === "FIADO" ? "warning" : "neutral"}
            label={order.estadoPago}
          />
          {order.fiadoEstado ? (
            <StatusBadge tone="neutral" label={`Fiado ${order.fiadoEstado}`} />
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 rounded-lg border border-border bg-background p-4 text-sm text-ink/80">
        <InfoItem label="Telefono" value={order.clienteTelefono || "Sin telefono"} />
        <InfoItem
          label="Lugar de trabajo"
          value={order.clienteLugarTrabajo || "No informado"}
        />
        <InfoItem
          label="Items"
          value={`${order.items.length} linea${order.items.length === 1 ? "" : "s"}`}
        />
        <InfoItem label="Cantidad total" value={String(order.cantidad)} />
      </div>

      <div className="rounded-lg border border-border bg-background p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink/70">
          Detalle de productos
        </h3>
        <div className="mt-4 space-y-3">
          {order.items.map((item) => (
            <div
              key={`${order.id}-${item.productoId}`}
              className="flex items-start justify-between gap-4 rounded-lg border border-border/70 bg-white px-4 py-3"
            >
              <div>
                <div className="font-medium text-ink">{item.productoNombre}</div>
                <div className="text-sm text-ink/65">
                  {formatCurrency(item.precioUnitario)} · x{item.cantidad}
                </div>
              </div>
              <div className="text-sm font-semibold text-primary">
                {formatCurrency(item.subtotal)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-background p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink/70">
          Resumen financiero
        </h3>
        <dl className="mt-4 space-y-3 text-sm text-ink/80">
          <InfoRow label="Total pedido" value={formatCurrency(order.total)} />
          <InfoRow label="Pagado acumulado" value={formatCurrency(order.totalPagado)} />
          <InfoRow
            label="Saldo pendiente"
            value={formatCurrency(order.saldoPendiente)}
            highlight={order.saldoPendiente > 0}
          />
          <InfoRow label="Pagos registrados" value={String(order.pagosRegistrados)} />
        </dl>
      </div>

      <div className="rounded-lg border border-border bg-background p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink/70">
          Historial
        </h3>
        <ul className="mt-4 space-y-3 text-sm text-ink/80">
          <TimelineItem label="Pedido recibido" value={formatDate(order.fechaPedido)} />
          {order.fechaAgendado ? (
            <TimelineItem label="Agendado" value={formatDate(order.fechaAgendado)} />
          ) : null}
          {order.fechaFiado ? (
            <TimelineItem label="Fiado generado" value={formatDate(order.fechaFiado)} />
          ) : null}
          {order.fechaUltimoPago ? (
            <TimelineItem label="Ultimo pago" value={formatDate(order.fechaUltimoPago)} />
          ) : null}
          {order.fechaPagoFiado ? (
            <TimelineItem
              label="Fiado saldado"
              value={formatDate(order.fechaPagoFiado)}
            />
          ) : null}
          {order.fechaCierre ? (
            <TimelineItem label="Cierre" value={formatDate(order.fechaCierre)} />
          ) : null}
          {order.fechaCancelacion ? (
            <TimelineItem
              label="Cancelado"
              value={`${formatDate(order.fechaCancelacion)}${
                order.motivoCancelacion ? ` · ${order.motivoCancelacion}` : ""
              }`}
            />
          ) : null}
        </ul>
      </div>
    </div>
  );
}

function AdminActionModal({
  state,
  busy,
  onClose,
  onConfirm
}: {
  state: Exclude<OrderModalState, null>;
  busy: boolean;
  onClose: () => void;
  onConfirm: (payload: {
    motivoCancelacion?: string;
    monto?: number;
    metodoPago?: string;
  }) => void;
}) {
  const [reason, setReason] = useState(
    state.type === "cancelar" ? "Cancelado por administrador" : ""
  );
  const [amount, setAmount] = useState(
    state.type === "abonar" ? String(state.order.saldoPendiente) : ""
  );
  const [method, setMethod] = useState("EFECTIVO");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-panel p-5 shadow-soft">
        <div className="space-y-2">
          <h3 className="text-xl font-semibold text-ink">
            {state.type === "cancelar" ? "Cancelar pedido" : "Registrar abono"}
          </h3>
          <p className="text-sm text-ink/70">
            {state.order.clienteNombre} · {state.order.productoNombre}
          </p>
        </div>

        <div className="mt-4 space-y-4">
          {state.type === "cancelar" ? (
            <label className="block space-y-2">
              <span className="text-sm font-medium text-ink">Motivo</span>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={4}
                className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm text-ink"
              />
            </label>
          ) : (
            <>
              <label className="block space-y-2">
                <span className="text-sm font-medium text-ink">Monto abonado</span>
                <input
                  type="number"
                  min={1}
                  max={state.order.saldoPendiente}
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm text-ink"
                />
              </label>
              <label className="block space-y-2">
                <span className="text-sm font-medium text-ink">Metodo de pago</span>
                <select
                  value={method}
                  onChange={(event) => setMethod(event.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm text-ink"
                >
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="TRANSFERENCIA">Transferencia</option>
                  <option value="TARJETA">Tarjeta</option>
                </select>
              </label>
            </>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-ink"
          >
            Cerrar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              onConfirm(
                state.type === "cancelar"
                  ? {
                      motivoCancelacion: reason.trim() || "Cancelado por administrador"
                    }
                  : {
                      monto: Number(amount),
                      metodoPago: method
                    }
              )
            }
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white"
          >
            {busy ? "Guardando..." : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProductModal({
  state,
  busy,
  onClose,
  onSave
}: {
  state: Exclude<ProductModalState, null>;
  busy: boolean;
  onClose: () => void;
  onSave: (payload: {
    id?: string;
    nombre: string;
    descripcion: string;
    precioVenta: number;
    costoUnitario: number;
    stockActual: number;
    tipoProducto: string;
    activo: boolean;
  }) => void;
}) {
  const current = state.mode === "edit" ? state.product : null;
  const [nombre, setNombre] = useState(current?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(current?.descripcion ?? "");
  const [precioVenta, setPrecioVenta] = useState(String(current?.precioVenta ?? 0));
  const [costoUnitario, setCostoUnitario] = useState(
    String(current?.costoUnitario ?? 0)
  );
  const [stockActual, setStockActual] = useState(String(current?.stockActual ?? 0));
  const [tipoProducto, setTipoProducto] = useState(current?.tipoProducto ?? "simple");
  const [activo, setActivo] = useState(current?.activo ?? true);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
      <div className="w-full max-w-xl rounded-lg border border-border bg-panel p-5 shadow-soft">
        <div className="space-y-1">
          <h3 className="text-xl font-semibold text-ink">
            {state.mode === "create" ? "Nuevo producto" : "Editar producto"}
          </h3>
          <p className="text-sm text-ink/70">
            Define nombre, precios, costo, stock y disponibilidad.
          </p>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block space-y-2 sm:col-span-2">
            <span className="text-sm font-medium text-ink">Nombre</span>
            <input
              value={nombre}
              onChange={(event) => setNombre(event.target.value)}
              className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm text-ink"
            />
          </label>
          <label className="block space-y-2 sm:col-span-2">
            <span className="text-sm font-medium text-ink">Descripcion</span>
            <textarea
              value={descripcion}
              onChange={(event) => setDescripcion(event.target.value)}
              rows={3}
              className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm text-ink"
            />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-ink">Precio venta</span>
            <input
              type="number"
              min={0}
              value={precioVenta}
              onChange={(event) => setPrecioVenta(event.target.value)}
              className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm text-ink"
            />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-ink">Costo unitario</span>
            <input
              type="number"
              min={0}
              value={costoUnitario}
              onChange={(event) => setCostoUnitario(event.target.value)}
              className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm text-ink"
            />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-ink">Stock actual</span>
            <input
              type="number"
              min={0}
              value={stockActual}
              onChange={(event) => setStockActual(event.target.value)}
              className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm text-ink"
            />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-ink">Tipo</span>
            <input
              value={tipoProducto}
              onChange={(event) => setTipoProducto(event.target.value)}
              className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm text-ink"
            />
          </label>
          <label className="flex items-center gap-3 rounded-lg border border-border bg-background px-4 py-3 text-sm text-ink sm:col-span-2">
            <input
              type="checkbox"
              checked={activo}
              onChange={(event) => setActivo(event.target.checked)}
            />
            Producto activo en catalogo
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-ink"
          >
            Cerrar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              onSave({
                id: current?.id,
                nombre,
                descripcion,
                precioVenta: Number(precioVenta),
                costoUnitario: Number(costoUnitario),
                stockActual: Number(stockActual),
                tipoProducto,
                activo
              })
            }
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white"
          >
            {busy ? "Guardando..." : "Guardar producto"}
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-ink/60">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}

function InfoRow({
  label,
  value,
  highlight
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-ink/60">{label}</dt>
      <dd className={highlight ? "font-semibold text-primary" : "font-medium text-ink"}>
        {value}
      </dd>
    </div>
  );
}

function TimelineItem({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-1 h-2.5 w-2.5 rounded-full bg-primary" />
      <div>
        <div className="font-medium text-ink">{label}</div>
        <div className="text-ink/65">{value}</div>
      </div>
    </li>
  );
}

function StatusBadge({
  tone,
  label
}: {
  tone: "pedido" | "warning" | "neutral";
  label: string;
}) {
  const classes =
    tone === "pedido"
      ? "bg-secondary/70 text-ink"
      : tone === "warning"
        ? "bg-primary/10 text-primary"
        : "bg-panel text-ink/80";

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${classes}`}>
      {label}
    </span>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("es-CL");
}

function buttonToneClass(tone: "primary" | "warning" | "muted") {
  if (tone === "primary") {
    return "rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white";
  }

  if (tone === "warning") {
    return "rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm font-medium text-primary";
  }

  return "rounded-lg border border-border bg-panel px-3 py-2 text-sm font-medium text-ink";
}
