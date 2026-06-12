"use client";

import { useMemo, useState } from "react";
import { formatCurrency } from "@/lib/format";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { AdminOrderSummary } from "@/lib/types";

type OrdersResponse = {
  pendientes: AdminOrderSummary[];
  agendados: AdminOrderSummary[];
};

type AdminDashboardProps = {
  initialData: OrdersResponse;
};

export function AdminDashboard({ initialData }: AdminDashboardProps) {
  const supabase = createSupabaseBrowserClient();
  const [data, setData] = useState<OrdersResponse>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busyOrderId, setBusyOrderId] = useState("");

  const resumen = useMemo(
    () => [
      { label: "Pedidos pendientes", value: data.pendientes.length.toString() },
      { label: "Pedidos agendados", value: data.agendados.length.toString() },
      {
        label: "Total agendado",
        value: formatCurrency(
          data.agendados.reduce((sum, order) => sum + order.total, 0)
        )
      }
    ],
    [data]
  );

  async function loadOrders() {
    try {
      setLoading(true);
      const response = await fetch("/api/admin/orders", { cache: "no-store" });
      const currentData = (await response.json()) as OrdersResponse & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(currentData.error ?? "No fue posible cargar pedidos.");
      }

      setData({
        pendientes: currentData.pendientes ?? [],
        agendados: currentData.agendados ?? []
      });
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

  async function runAction(
    pedidoId: string,
    action: "agendar" | "cancelar" | "pagado" | "fiado"
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
          motivoCancelacion:
            action === "cancelar" ? "Cancelado por administrador" : undefined
        })
      });

      const currentData = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(currentData.error ?? "No fue posible actualizar el pedido.");
      }

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

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/admin/login";
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6">
      <section className="flex flex-col gap-4 rounded-lg border border-border bg-panel p-6 shadow-soft sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <span className="inline-flex rounded-full bg-secondary px-3 py-1 text-sm font-semibold text-ink">
            Panel admin
          </span>
          <h1 className="text-3xl font-bold text-ink">Gestion de pedidos</h1>
          <p className="max-w-2xl text-sm leading-6 text-ink/75">
            Base admin del MVP con pedidos pendientes y agendados usando
            Supabase Auth y control de acceso por la tabla `usuarios_admin`.
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

      <section className="grid gap-4 sm:grid-cols-3">
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

      {error ? (
        <div className="rounded-lg border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
          {error}
        </div>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-2">
        <OrderColumn
          title="Pedidos pendientes"
          subtitle="Acciones rapidas para confirmar o cancelar."
          loading={loading}
          orders={data.pendientes}
          actions={[
            { key: "agendar", label: "Agendar" },
            { key: "cancelar", label: "Cancelar" }
          ]}
          busyOrderId={busyOrderId}
          onAction={runAction}
        />

        <OrderColumn
          title="Pedidos agendados"
          subtitle="Cerrar como pagado, fiado o cancelar."
          loading={loading}
          orders={data.agendados}
          actions={[
            { key: "pagado", label: "Marcar pagado" },
            { key: "fiado", label: "Marcar fiado" },
            { key: "cancelar", label: "Cancelar" }
          ]}
          busyOrderId={busyOrderId}
          onAction={runAction}
        />
      </section>
    </main>
  );
}

type OrderColumnProps = {
  title: string;
  subtitle: string;
  loading: boolean;
  orders: AdminOrderSummary[];
  actions: Array<{
    key: "agendar" | "cancelar" | "pagado" | "fiado";
    label: string;
  }>;
  busyOrderId: string;
  onAction: (
    pedidoId: string,
    action: "agendar" | "cancelar" | "pagado" | "fiado"
  ) => void;
};

function OrderColumn({
  title,
  subtitle,
  loading,
  orders,
  actions,
  busyOrderId,
  onAction
}: OrderColumnProps) {
  return (
    <section className="rounded-lg border border-border bg-panel p-5 shadow-soft">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold text-ink">{title}</h2>
        <p className="text-sm text-ink/70">{subtitle}</p>
      </div>

      <div className="mt-5 space-y-4">
        {loading ? <p className="text-sm text-ink/70">Cargando pedidos...</p> : null}
        {!loading && orders.length === 0 ? (
          <p className="text-sm text-ink/70">No hay pedidos en esta vista.</p>
        ) : null}
        {orders.map((order) => (
          <article
            key={order.id}
            className="space-y-4 rounded-lg border border-border bg-background p-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-ink">
                  {order.clienteNombre}
                </h3>
                <p className="text-sm text-ink/70">{order.clienteLugarTrabajo}</p>
                <p className="text-sm text-ink/70">{order.clienteTelefono}</p>
              </div>
              <div className="rounded-full bg-panel px-3 py-1 text-xs font-semibold text-ink">
                {order.estadoPedido}
              </div>
            </div>

            <dl className="grid gap-2 text-sm text-ink/80 sm:grid-cols-2">
              <div>
                <dt className="text-ink/60">Producto</dt>
                <dd className="font-medium text-ink">{order.productoNombre}</dd>
              </div>
              <div>
                <dt className="text-ink/60">Cantidad</dt>
                <dd className="font-medium text-ink">{order.cantidad}</dd>
              </div>
              <div>
                <dt className="text-ink/60">Fecha pedido</dt>
                <dd className="font-medium text-ink">
                  {new Date(order.fechaPedido).toLocaleString("es-CL")}
                </dd>
              </div>
              <div>
                <dt className="text-ink/60">Total</dt>
                <dd className="font-medium text-primary">
                  {formatCurrency(order.total)}
                </dd>
              </div>
            </dl>

            <div className="flex flex-wrap gap-2">
              {actions.map((action) => (
                <button
                  key={action.key}
                  type="button"
                  disabled={busyOrderId === order.id}
                  onClick={() => onAction(order.id, action.key)}
                  className="rounded-lg border border-border bg-panel px-3 py-2 text-sm font-medium text-ink"
                >
                  {busyOrderId === order.id ? "Procesando..." : action.label}
                </button>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
