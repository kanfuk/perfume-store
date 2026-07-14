"use client";

import { type ReactNode } from "react";
import {
  AlertCircle,
  BarChart3,
  Boxes,
  CalendarClock,
  CalendarRange,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  HandCoins,
  Sparkles,
  Store,
  UserRound,
  WalletCards
} from "lucide-react";
import {
  buttonToneClass,
  formatBadgePermission,
  formatDateOnly,
  formatShortDateTime,
  renderGroupedItemLines
} from "@/components/admin/dashboard/admin-dashboard.utils";
import {
  EmptyState,
  FocusCard,
  HeroMetric,
  HomeActionCard,
  MiniMetric,
  QuickTaskRow,
  SimpleFact,
  StatusBadge
} from "@/components/admin/dashboard/DashboardPresentation";
import { formatCurrency } from "@/lib/format";
import { getUnifiedProductStock } from "@/lib/stock";
import type {
  AdminBadgeDeviceSetting,
  AdminOrderSummary,
  AdminProductRecord
} from "@/lib/types";

type DashboardHomeSummary = {
  agendaHoy: number;
  saldoPorCobrar: number;
  ventasCerradas: number;
  productosActivos: number;
  stockTotal: number;
};

type DashboardAgendaGroup = {
  key: string;
  clienteNombre: string;
  clienteTelefono: string | null;
  fechaEntrega: string;
  totalItems: number;
  totalMonto: number;
  totalPedidos: number;
  itemLines: Array<{ name: string; quantity: number }>;
};

type DashboardHomeViewProps = {
  agendaGroups: DashboardAgendaGroup[];
  agendadosCount: number;
  attentionCount: number;
  badgeActionLoading: boolean;
  badgeCardLoading: boolean;
  badgeDeviceId: string;
  badgeDeviceSetting: AdminBadgeDeviceSetting | null;
  badgeSupported: boolean;
  customerCardsCount: number;
  finalizadosCount: number;
  groupedFiadosCount: number;
  homeSummary: DashboardHomeSummary;
  isInstalledPwa: boolean;
  notificationPermission: NotificationPermission | "unsupported";
  pendingUnseenOrders: AdminOrderSummary[];
  products: AdminProductRecord[];
  pushSubscriptionActive: boolean;
  pushSupported: boolean;
  reportSummaryTotalVentas: number;
  renderNewOrderWhatsAppButton: (order: AdminOrderSummary) => ReactNode;
  onActivateBadgeForCurrentDevice: () => void;
  onMarkOrderSeen: (order: AdminOrderSummary) => void;
  onOpenAttentionOrders: () => void;
  onOpenClientes: () => void;
  onOpenCobros: () => void;
  onOpenPendingOrderDetail: (orderId: string) => void;
  onOpenReportes: () => void;
  onOpenStock: () => void;
  onOpenStockWithoutInventory: () => void;
  onTestBadgeOnCurrentDevice: () => void;
  onTestPushOnCurrentDevice: () => void;
};

export function DashboardHomeView({
  agendaGroups,
  agendadosCount,
  attentionCount,
  badgeActionLoading,
  badgeCardLoading,
  badgeDeviceId,
  badgeDeviceSetting,
  badgeSupported,
  customerCardsCount,
  finalizadosCount,
  groupedFiadosCount,
  homeSummary,
  isInstalledPwa,
  notificationPermission,
  pendingUnseenOrders,
  products,
  pushSubscriptionActive,
  pushSupported,
  reportSummaryTotalVentas,
  renderNewOrderWhatsAppButton,
  onActivateBadgeForCurrentDevice,
  onMarkOrderSeen,
  onOpenAttentionOrders,
  onOpenClientes,
  onOpenCobros,
  onOpenPendingOrderDetail,
  onOpenReportes,
  onOpenStock,
  onOpenStockWithoutInventory,
  onTestBadgeOnCurrentDevice,
  onTestPushOnCurrentDevice
}: DashboardHomeViewProps) {
  const outOfStockCount = products.filter((product) => getUnifiedProductStock(product) <= 0).length;

  return (
    <section className="min-w-0 max-w-full overflow-x-hidden space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <HeroMetric
          label="Pedidos por atender"
          value={String(attentionCount)}
          detail="Sin agendar o aun no revisados"
          icon={Clock3}
          tone="rose"
        />
        <HeroMetric
          label="Agenda de hoy"
          value={String(homeSummary.agendaHoy)}
          detail="Pedidos a coordinar o entregar hoy"
          icon={CalendarClock}
          tone="violet"
        />
        <HeroMetric
          label="Por cobrar"
          value={formatCurrency(homeSummary.saldoPorCobrar)}
          detail="Saldo pendiente de fiados"
          icon={HandCoins}
          tone="amber"
        />
        <HeroMetric
          label="Ventas cerradas"
          value={formatCurrency(homeSummary.ventasCerradas)}
          detail="Pagos y cierres acumulados"
          icon={CircleDollarSign}
          tone="emerald"
        />
      </div>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="rounded-[24px] border border-emerald-100 bg-white/95 p-5 shadow-soft">
          <div className="flex items-center gap-3">
            <span className="rounded-2xl bg-emerald-100 p-3 text-emerald-700">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-xl font-bold text-emerald-950">Lo de hoy</h2>
              <p className="text-sm text-emerald-900/65">Tres decisiones y listo.</p>
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            <QuickTaskRow
              title="Revisar pendientes"
              detail={`${attentionCount} pedido(s) por atender`}
              icon={Clock3}
              onClick={onOpenAttentionOrders}
            />
            <QuickTaskRow
              title="Cerrar ventas"
              detail={`${agendadosCount} pedido(s) listos para cobrar`}
              icon={WalletCards}
              onClick={onOpenCobros}
            />
            <QuickTaskRow
              title="Ajustar stock"
              detail={`${outOfStockCount} producto(s) sin stock`}
              icon={Boxes}
              onClick={onOpenStockWithoutInventory}
            />
          </div>
        </article>

        <article className="rounded-[24px] border border-emerald-100 bg-white/95 p-5 shadow-soft">
          <div className="flex items-center gap-3">
            <span className="rounded-2xl bg-violet-100 p-3 text-violet-700">
              <BarChart3 className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-xl font-bold text-emerald-950">Cierre rapido</h2>
              <p className="text-sm text-emerald-900/65">Numeros puntuales del negocio.</p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <SimpleFact label="Ventas del rango" value={formatCurrency(reportSummaryTotalVentas)} />
            <SimpleFact label="Productos sin stock" value={String(outOfStockCount)} />
          </div>
        </article>
      </section>

      {!badgeDeviceSetting?.badgeEnabled ? (
        <section className="rounded-[24px] border border-emerald-100 bg-white/95 p-5 shadow-soft">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-emerald-950">Badge del icono</h2>
              <p className="mt-1 text-sm text-emerald-900/65">
                Activa el contador de pedidos pendientes en el icono de la app de tu iPhone.
              </p>
            </div>
            {badgeDeviceSetting?.badgeEnabled ? (
              <StatusBadge tone="pedido" label="ACTIVO" />
            ) : (
              <StatusBadge tone="neutral" label="POR ACTIVAR" />
            )}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <SimpleFact label="Soporte" value={badgeSupported ? "Disponible" : "No compatible"} />
            <SimpleFact
              label="Modo app"
              value={isInstalledPwa ? "Desde icono" : "Abrir desde inicio"}
            />
            <SimpleFact
              label="Permiso"
              value={formatBadgePermission(notificationPermission)}
            />
            <SimpleFact label="Contador actual" value={String(attentionCount)} />
            <SimpleFact
              label="Push"
              value={
                !pushSupported ? "No compatible" : pushSubscriptionActive ? "Activo" : "Pendiente"
              }
            />
          </div>

          <div className="mt-4 space-y-2 text-sm text-emerald-900/75">
            {!badgeSupported ? <p>Este navegador no soporta badge en el icono.</p> : null}
            {!isInstalledPwa ? (
              <p>
                Para ver el badge en el icono, instala Pauli Store en la pantalla de inicio y abre
                la app desde ese icono.
              </p>
            ) : null}
            {!pushSupported ? (
              <p>Este navegador no soporta notificaciones push web para esta app.</p>
            ) : null}
            {notificationPermission === "denied" ? (
              <p>
                El permiso fue denegado. Debes activarlo desde Ajustes del iPhone para esta app.
              </p>
            ) : null}
            {badgeDeviceSetting?.badgeEnabled ? (
              <p>Badge activo en este dispositivo.</p>
            ) : (
              <p>Activa el badge desde este dispositivo para sincronizarlo con los pedidos.</p>
            )}
            {pushSubscriptionActive ? (
              <p>Las notificaciones push estan activas para este dispositivo.</p>
            ) : null}
            {badgeDeviceSetting?.lastSyncAt ? (
              <p>Ultima sincronizacion: {formatShortDateTime(badgeDeviceSetting.lastSyncAt)}.</p>
            ) : null}
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={badgeActionLoading || badgeCardLoading || !badgeDeviceId}
              onClick={onActivateBadgeForCurrentDevice}
              className="inline-flex min-h-11 items-center justify-center rounded-[18px] bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-emerald-200"
            >
              {badgeActionLoading ? "Activando..." : "Activar badge en este iPhone"}
            </button>
            {badgeDeviceSetting?.badgeEnabled ? (
              <button
                type="button"
                disabled={badgeActionLoading}
                onClick={onTestBadgeOnCurrentDevice}
                className="inline-flex min-h-11 items-center justify-center rounded-[18px] border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold text-emerald-900 disabled:cursor-not-allowed disabled:bg-emerald-50"
              >
                Probar badge
              </button>
            ) : null}
            {pushSupported && pushSubscriptionActive ? (
              <button
                type="button"
                disabled={badgeActionLoading}
                onClick={onTestPushOnCurrentDevice}
                className="inline-flex min-h-11 items-center justify-center rounded-[18px] border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold text-emerald-900 disabled:cursor-not-allowed disabled:bg-emerald-50"
              >
                Probar notificacion
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-3">
        <article className="rounded-[24px] border border-emerald-100 bg-white/95 p-5 shadow-soft lg:col-span-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-emerald-950">Pedidos por atender</h2>
              <p className="mt-1 text-sm text-emerald-900/65">
                Lo ultimo que entro y aun sigue sin agenda o sin revision final. Desde aqui puedes
                revisar, abrir agenda o compartir el resumen por WhatsApp.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenAttentionOrders}
              className="inline-flex min-h-11 items-center justify-center rounded-[18px] bg-emerald-600 px-4 py-3 text-sm font-semibold text-white"
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
                className="rounded-[20px] border border-emerald-100 bg-emerald-50/70 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-base font-semibold text-emerald-950">
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
                    <div className="text-sm text-emerald-900/70">
                      {order.clienteLugarTrabajo || "Sin lugar"} ·{" "}
                      {order.clienteTelefono || "Sin telefono"}
                    </div>
                    <div className="space-y-1 text-sm text-emerald-900/80">
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
                    <div className="text-xs uppercase tracking-wide text-emerald-700/70">Total</div>
                    <div className="mt-1 text-lg font-bold text-emerald-950">
                      {formatCurrency(order.total)}
                    </div>
                    <div className="mt-1 text-xs text-emerald-900/65">
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
        </article>

        <FocusCard
          title="Lo primero hoy"
          text="Revisa pedidos pendientes y asignales fecha antes de todo."
          icon={AlertCircle}
          tone="rose"
        />
        <FocusCard
          title="Despues cobra"
          text="Los pedidos agendados se cierran como pagados o fiados desde Ventas."
          icon={CheckCircle2}
          tone="violet"
        />
        <FocusCard
          title="Y al final repone"
          text="Ajusta stock y pausa productos cuando no vayas a venderlos."
          icon={Boxes}
          tone="amber"
        />
      </section>

      <section className="rounded-lg border border-emerald-100 bg-white/90 p-5 shadow-soft">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold text-emerald-950">Atajos principales</h2>
          <p className="text-sm text-emerald-900/70">
            Entra directo a lo que mas usa Pauli en el dia a dia.
          </p>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <HomeActionCard
            title="Agenda"
            subtitle="Revisar pendientes, agendar fechas y ver pedidos del dia."
            badge={`${attentionCount} por atender`}
            icon={ClipboardList}
            tone="rose"
            onClick={onOpenAttentionOrders}
          />
          <HomeActionCard
            title="Stock"
            subtitle="Crear productos, abrir o pausar catalogo y ajustar cupos."
            badge={`${homeSummary.productosActivos} activos`}
            icon={Boxes}
            tone="violet"
            onClick={onOpenStock}
          />
          <HomeActionCard
            title="Ventas"
            subtitle="Marcar pagado, dejar fiado y registrar abonos facilmente."
            badge={`${groupedFiadosCount} fiados`}
            icon={WalletCards}
            tone="amber"
            onClick={onOpenCobros}
          />
          <HomeActionCard
            title="Clientes"
            subtitle="Ver quienes compran seguido y sus fechas mas recientes."
            badge={`${customerCardsCount} registros`}
            icon={UserRound}
            tone="emerald"
            onClick={onOpenClientes}
          />
          <HomeActionCard
            title="Reportes"
            subtitle="Ventas por rango de fechas, top productos y top clientes."
            badge="Resumen rapido"
            icon={CalendarRange}
            tone="slate"
            onClick={onOpenReportes}
          />
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <section className="rounded-lg border border-emerald-100 bg-white/90 p-5 shadow-soft">
          <div className="flex items-center gap-2 text-emerald-950">
            <Sparkles className="h-5 w-5" />
            <h3 className="text-lg font-bold">Agenda agrupada</h3>
          </div>
          <p className="mt-1 text-sm text-emerald-900/70">
            Si una misma persona pidio varias veces para el mismo dia, aqui aparece todo junto.
          </p>

          <div className="mt-4 space-y-3">
            {agendaGroups.length === 0 ? <EmptyState text="Todavia no hay pedidos agendados." /> : null}
            {agendaGroups.slice(0, 4).map((group) => (
              <article
                key={group.key}
                className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-emerald-950">{group.clienteNombre}</div>
                    <div className="mt-1 text-sm text-emerald-900/65">
                      {group.fechaEntrega === "sin-fecha"
                        ? "Sin fecha"
                        : formatDateOnly(group.fechaEntrega)}
                    </div>
                  </div>
                  <StatusBadge tone="neutral" label={`${group.totalPedidos} pedido(s)`} />
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <MiniMetric label="Items" value={String(group.totalItems)} />
                  <MiniMetric label="Monto" value={formatCurrency(group.totalMonto)} />
                  <MiniMetric label="Telefono" value={group.clienteTelefono || "-"} />
                </div>
                <div className="mt-3 space-y-2 rounded-2xl border border-emerald-100 bg-white/90 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700/70">
                    Pedido
                  </div>
                  {renderGroupedItemLines(group.itemLines, 4).map((line) => (
                    <div key={`${group.key}-${line}`} className="text-sm text-emerald-900/80">
                      {line}
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-emerald-100 bg-white/90 p-5 shadow-soft">
          <div className="flex items-center gap-2 text-emerald-950">
            <Store className="h-5 w-5" />
            <h3 className="text-lg font-bold">Resumen al grano</h3>
          </div>
          <div className="mt-4 space-y-3">
            <SimpleFact label="Productos activos" value={`${homeSummary.productosActivos}`} />
            <SimpleFact label="Stock total" value={`${homeSummary.stockTotal}`} />
            <SimpleFact label="Pedidos agendados" value={`${agendadosCount}`} />
            <SimpleFact label="Pedidos cerrados" value={`${finalizadosCount}`} />
          </div>
        </section>
      </section>
    </section>
  );
}
