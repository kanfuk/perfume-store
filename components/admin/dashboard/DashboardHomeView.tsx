"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Boxes,
  CalendarClock,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  ShoppingBag,
  UploadCloud
} from "lucide-react";
import {
  buttonToneClass,
  formatDateOnly,
  formatShortDateTime,
  renderGroupedItemLines
} from "@/components/admin/dashboard/admin-dashboard.utils";
import {
  EmptyState,
  HeroMetric,
  StatusBadge
} from "@/components/admin/dashboard/DashboardPresentation";
import { formatCurrency } from "@/lib/format";
import type { AdminOrderSummary } from "@/lib/types";

type DashboardHomeSummary = {
  agendaHoy: number;
  productosActivos: number;
  stockTotal: number;
  stockCritico: number;
};

type DashboardHomeViewProps = {
  attentionCount: number;
  homeSummary: DashboardHomeSummary;
  pendingUnseenOrders: AdminOrderSummary[];
  paymentSettingsComplete: boolean | null;
  weekSalesTotal: number;
  renderNewOrderWhatsAppButton: (order: AdminOrderSummary) => ReactNode;
  onMarkOrderSeen: (order: AdminOrderSummary) => void;
  onOpenAttentionOrders: () => void;
  onOpenPendingOrderDetail: (orderId: string) => void;
};

/**
 * Fase F: el dashboard deja solo informacion operativa (pedidos pendientes,
 * ventas de la semana, stock critico, productos activos) y 4 acciones
 * rapidas. Se retiraron las tarjetas que duplicaban la navegacion principal
 * (Agenda/Stock/Ventas/Clientes/Reportes ya viven en AdminNav), las tarjetas
 * de fiados (Smellme.cl no usa fiados) y los bloques decorativos sin
 * accion real.
 */
export function DashboardHomeView({
  attentionCount,
  homeSummary,
  pendingUnseenOrders,
  paymentSettingsComplete,
  weekSalesTotal,
  renderNewOrderWhatsAppButton,
  onMarkOrderSeen,
  onOpenAttentionOrders,
  onOpenPendingOrderDetail
}: DashboardHomeViewProps) {
  return (
    <section className="min-w-0 max-w-full overflow-x-hidden space-y-5">
      {paymentSettingsComplete === false ? (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-[22px] border border-amber-200 bg-amber-50 p-4 text-amber-950 shadow-soft">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <h2 className="font-bold">Faltan datos de transferencia</h2>
              <p className="mt-1 text-sm">
                No tienes una cuenta de cobro configurada. Solicita al OWNER que la configure.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <HeroMetric
          label="Pedidos pendientes"
          value={String(attentionCount)}
          detail="Sin agendar o aun no revisados"
          icon={Clock3}
          tone="rose"
        />
        <HeroMetric
          label="Ventas de la semana"
          value={formatCurrency(weekSalesTotal)}
          detail="Lunes a domingo actual, desde Reportes"
          icon={CircleDollarSign}
          tone="emerald"
        />
        <HeroMetric
          label="Stock crítico"
          value={String(homeSummary.stockCritico)}
          detail="Productos activos en stock mínimo o sin stock"
          icon={Boxes}
          tone="amber"
        />
        <HeroMetric
          label="Productos activos"
          value={String(homeSummary.productosActivos)}
          detail="Visibles en el catálogo público"
          icon={CalendarClock}
          tone="violet"
        />
      </div>

      <section className="rounded-[24px] border border-brand-100 bg-white/95 p-5 shadow-soft">
        <h2 className="text-lg font-bold text-brand-950">Acciones rápidas</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Link
            href="/admin/venta-directa"
            className="flex min-h-14 items-center gap-3 rounded-[18px] border border-brand-100 bg-brand-50/60 px-4 text-sm font-semibold text-brand-950 transition hover:border-brand-300"
          >
            <ShoppingBag className="h-5 w-5 text-brand-700" />
            Venta directa
          </Link>
          <Link
            href="/admin/importar-catalogo"
            className="flex min-h-14 items-center gap-3 rounded-[18px] border border-brand-100 bg-brand-50/60 px-4 text-sm font-semibold text-brand-950 transition hover:border-brand-300"
          >
            <UploadCloud className="h-5 w-5 text-brand-700" />
            Importar catálogo
          </Link>
          <button
            type="button"
            onClick={onOpenAttentionOrders}
            className="flex min-h-14 items-center gap-3 rounded-[18px] border border-brand-100 bg-brand-50/60 px-4 text-sm font-semibold text-brand-950 transition hover:border-brand-300"
          >
            <ClipboardList className="h-5 w-5 text-brand-700" />
            Revisar pedidos
          </button>
        </div>
      </section>

      <section className="rounded-[24px] border border-brand-100 bg-white/95 p-5 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-brand-950">Pedidos por atender</h2>
            <p className="mt-1 text-sm text-brand-900/65">
              Lo ultimo que entro y aun sigue sin agenda o sin revision final.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenAttentionOrders}
            className="inline-flex min-h-11 items-center justify-center rounded-[18px] bg-brand-600 px-4 py-3 text-sm font-semibold text-white"
          >
            Abrir pedidos
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {pendingUnseenOrders.length === 0 ? (
            <EmptyState text="No hay pedidos por atender ahora mismo." />
          ) : null}
          {pendingUnseenOrders.map((order) => (
            <article
              key={order.id}
              className="rounded-[20px] border border-brand-100 bg-brand-50/70 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-base font-semibold text-brand-950">
                      {order.clienteNombre}
                    </div>
                    <StatusBadge tone="warning" label="NUEVO" />
                    {order.fechaEntrega ? (
                      <StatusBadge
                        tone="neutral"
                        label={`Entrega ${formatDateOnly(order.fechaEntrega)}`}
                      />
                    ) : null}
                  </div>
                  <div className="text-sm text-brand-900/70">
                    {order.clienteLugarTrabajo || "Sin lugar"} ·{" "}
                    {order.clienteTelefono || "Sin telefono"}
                  </div>
                  <div className="space-y-1 text-sm text-brand-900/80">
                    {renderGroupedItemLines(
                      order.items.map((item) => ({
                        name: item.productoNombre,
                        quantity: item.cantidad
                      })),
                      3
                    ).map((line) => (
                      <div key={`${order.id}-${line}`}>{line}</div>
                    ))}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs uppercase tracking-wide text-brand-700/70">Total</div>
                  <div className="mt-1 text-lg font-bold text-brand-950">
                    {formatCurrency(order.total)}
                  </div>
                  <div className="mt-1 text-xs text-brand-900/65">
                    {formatShortDateTime(order.fechaPedido)}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap">
                <button
                  type="button"
                  onClick={() => onOpenPendingOrderDetail(order.id)}
                  className={`${buttonToneClass("primary")} w-full justify-center sm:w-auto`}
                >
                  Ver detalle
                </button>
                <button
                  type="button"
                  onClick={() => onMarkOrderSeen(order)}
                  className={`${buttonToneClass("muted")} w-full justify-center sm:w-auto`}
                >
                  Marcar visto
                </button>
                {renderNewOrderWhatsAppButton(order)}
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
