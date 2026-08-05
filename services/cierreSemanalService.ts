/**
 * Proyecto: Perfume Store
 * Modulo: Servicio de Cierres Semanales (Fase 7.6A)
 * Descripcion: Calcula la fotografia (snapshot) de un periodo semanal
 * reutilizando exactamente las mismas reglas de negocio ya usadas por el
 * dashboard admin (PedidoService.obtenerDashboardAdmin +
 * resolveOrderItemProfitabilityCost), y coordina la creacion/lectura/
 * reapertura/exportacion de cierres via CierreSemanalRepository.
 * Ver docs/SMELLME_WEEKLY_CLOSURES_DESIGN.md para la justificacion completa
 * de cada metrica.
 * Buenas practicas: Codigo modular, validado y orientado a mantenibilidad.
 * Seguridad: No incluir claves ni datos sensibles en este archivo.
 */

import { resolveOrderItemProfitabilityCost } from "@/components/admin/dashboard/admin-dashboard.utils";
import { CierreSemanal, CierreSemanalMetrics, validarMotivoReapertura } from "@/domain/CierreSemanal";
import type { AdminOrderSummary, AdminProductRecord } from "@/lib/types";
import { buildWeeklyClosureCsv, buildWeeklyClosureCsvFilename, WeeklyClosureCsvInput } from "@/lib/weekly-closures/csv";
import {
  getCurrentWeekPeriod,
  getPreviousWeekPeriod,
  getWeekPeriodBoundariesForMonday,
  isMondayDateInput,
  WeekPeriod
} from "@/lib/weekly-closures/period";
import { WeeklyClosureError } from "@/lib/weeklyClosureErrors";
import { getSalesAccountingDate } from "@/lib/sales-accounting-date";
import { getCierreSemanalRepository, type AdminIdentidad, type CierreSemanalRepository } from "@/repositories/cierreSemanalRepository";
import { getPedidoRepository } from "@/repositories/pedidoRepository";
import { createPedidoService } from "@/services/pedidoService";
import { createProductoService } from "@/services/productoService";

const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 100;

export type WeeklyClosurePreview = {
  periodStart: string;
  periodEndExclusive: string;
  metrics: CierreSemanalMetrics;
  snapshot: Record<string, unknown>;
};

export type WeeklyClosureView = {
  id: string;
  periodStart: string;
  periodEndExclusive: string;
  version: number;
  status: "CLOSED" | "REOPENED";
  metrics: CierreSemanalMetrics;
  closedAt: string;
  closedByEmail: string | null;
  closedByNombre: string | null;
  reopenedAt: string | null;
  reopenedByEmail: string | null;
  reopenedByNombre: string | null;
  hasReopenReason: boolean;
};

export type WeeklyClosureDetailView = WeeklyClosureView & {
  snapshot: Record<string, unknown>;
  reopenReason: string | null;
};

function canonicalPedidoFecha(order: AdminOrderSummary): string {
  return order.fechaPedido;
}

function canonicalVentaFecha(order: AdminOrderSummary): string {
  return getSalesAccountingDate(order);
}

function estaEnPeriodo(fechaIso: string, period: WeekPeriod): boolean {
  const fecha = new Date(fechaIso).getTime();

  if (Number.isNaN(fecha)) {
    return false;
  }

  return fecha >= period.periodStart.getTime() && fecha < period.periodEndExclusive.getTime();
}

function validatePeriod(mondayDateInput: string): WeekPeriod {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(mondayDateInput)) {
    throw new WeeklyClosureError("WC005", "La fecha de inicio de semana no es valida.");
  }

  if (!isMondayDateInput(mondayDateInput)) {
    throw new WeeklyClosureError("WC005", "El periodo debe iniciar un dia lunes.");
  }

  return getWeekPeriodBoundariesForMonday(mondayDateInput);
}

function toMetricsView(record: {
  ordersCount: number;
  cancelledOrdersCount: number;
  pendingOrdersCount: number;
  deliveredOrdersCount: number;
  directSalesCount: number;
  grossSales: number;
  incomeAmount: number;
  costAmount: number;
  profitAmount: number;
  outstandingAmount: number;
}): CierreSemanalMetrics {
  return {
    ordersCount: record.ordersCount,
    cancelledOrdersCount: record.cancelledOrdersCount,
    pendingOrdersCount: record.pendingOrdersCount,
    deliveredOrdersCount: record.deliveredOrdersCount,
    directSalesCount: record.directSalesCount,
    grossSales: record.grossSales,
    incomeAmount: record.incomeAmount,
    costAmount: record.costAmount,
    profitAmount: record.profitAmount,
    outstandingAmount: record.outstandingAmount
  };
}

function toClosureView(cierre: CierreSemanal): WeeklyClosureView {
  return {
    id: cierre.id,
    periodStart: cierre.periodStart.toISOString(),
    periodEndExclusive: cierre.periodEndExclusive.toISOString(),
    version: cierre.version,
    status: cierre.status,
    metrics: toMetricsView(cierre),
    closedAt: cierre.closedAt.toISOString(),
    closedByEmail: cierre.closedByEmail,
    closedByNombre: cierre.closedByNombre,
    reopenedAt: cierre.reopenedAt ? cierre.reopenedAt.toISOString() : null,
    reopenedByEmail: cierre.reopenedByEmail,
    reopenedByNombre: cierre.reopenedByNombre,
    hasReopenReason: Boolean(cierre.reopenReason?.trim())
  };
}

function toClosureDetailView(cierre: CierreSemanal): WeeklyClosureDetailView {
  return {
    ...toClosureView(cierre),
    snapshot: cierre.snapshot,
    reopenReason: cierre.reopenReason
  };
}

/**
 * Calcula el snapshot de metricas de un periodo, reutilizando integramente
 * PedidoService.obtenerDashboardAdmin (misma fuente que el dashboard admin)
 * y resolveOrderItemProfitabilityCost (misma fuente que la pestana
 * Rentabilidad). No reimplementa ninguna regla de negocio nueva.
 */
export class CierreSemanalService {
  constructor(private readonly repository: CierreSemanalRepository = getCierreSemanalRepository()) {}

  sugerirPeriodoActual(): { mondayDateInput: string } {
    return { mondayDateInput: getCurrentWeekPeriod().mondayDateInput };
  }

  sugerirPeriodoAnterior(): { mondayDateInput: string } {
    return { mondayDateInput: getPreviousWeekPeriod().mondayDateInput };
  }

  async previsualizarCierre(mondayDateInput: string): Promise<WeeklyClosurePreview> {
    const period = validatePeriod(mondayDateInput);
    const { metrics, snapshot } = await this.calcularSnapshot(period);

    return {
      periodStart: period.periodStart.toISOString(),
      periodEndExclusive: period.periodEndExclusive.toISOString(),
      metrics,
      snapshot
    };
  }

  async crearCierre(mondayDateInput: string, admin: AdminIdentidad): Promise<WeeklyClosureDetailView> {
    const period = validatePeriod(mondayDateInput);

    const existingActive = await this.repository.obtenerCierreActivoPorPeriodo(
      period.periodStart,
      period.periodEndExclusive
    );

    if (existingActive) {
      throw new WeeklyClosureError("WC001", "Ya existe un cierre activo para este periodo.");
    }

    const { metrics, snapshot } = await this.calcularSnapshot(period);

    const cierre = await this.repository.crearCierre({
      periodStart: period.periodStart,
      periodEndExclusive: period.periodEndExclusive,
      metrics,
      snapshot,
      admin
    });

    return toClosureDetailView(cierre);
  }

  async listarCierres(params: { limit?: number; offset?: number }): Promise<{
    items: WeeklyClosureView[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const limit = Math.min(Math.max(1, params.limit ?? DEFAULT_LIST_LIMIT), MAX_LIST_LIMIT);
    const offset = Math.max(0, params.offset ?? 0);

    const { items, total } = await this.repository.listarCierres({ limit, offset });

    return { items: items.map(toClosureView), total, limit, offset };
  }

  async obtenerDetalle(closureId: string): Promise<WeeklyClosureDetailView> {
    const cierre = await this.repository.obtenerCierrePorId(closureId);

    if (!cierre) {
      throw new WeeklyClosureError("WC002", "Cierre no encontrado.");
    }

    return toClosureDetailView(cierre);
  }

  async reabrirCierre(
    closureId: string,
    reasonInput: unknown,
    admin: AdminIdentidad
  ): Promise<WeeklyClosureDetailView> {
    const reason = validarMotivoReapertura(reasonInput);
    const cierre = await this.repository.reabrirCierre({ closureId, reason, admin });
    return toClosureDetailView(cierre);
  }

  async exportarCsv(closureId: string): Promise<{ filename: string; content: string }> {
    const cierre = await this.repository.obtenerCierrePorId(closureId);

    if (!cierre) {
      throw new WeeklyClosureError("WC002", "Cierre no encontrado.");
    }

    const input: WeeklyClosureCsvInput = {
      id: cierre.id,
      periodStart: cierre.periodStart.toISOString(),
      periodEndExclusive: cierre.periodEndExclusive.toISOString(),
      version: cierre.version,
      status: cierre.status,
      ordersCount: cierre.ordersCount,
      cancelledOrdersCount: cierre.cancelledOrdersCount,
      pendingOrdersCount: cierre.pendingOrdersCount,
      deliveredOrdersCount: cierre.deliveredOrdersCount,
      directSalesCount: cierre.directSalesCount,
      grossSales: cierre.grossSales,
      incomeAmount: cierre.incomeAmount,
      costAmount: cierre.costAmount,
      profitAmount: cierre.profitAmount,
      outstandingAmount: cierre.outstandingAmount,
      closedAt: cierre.closedAt.toISOString(),
      closedByEmail: cierre.closedByEmail,
      reopenedAt: cierre.reopenedAt ? cierre.reopenedAt.toISOString() : null,
      hasReopenReason: Boolean(cierre.reopenReason?.trim())
    };

    return {
      filename: buildWeeklyClosureCsvFilename(cierre.periodStart.toISOString().slice(0, 10), cierre.version),
      content: buildWeeklyClosureCsv(input)
    };
  }

  /**
   * Ver docs/SMELLME_WEEKLY_CLOSURES_DESIGN.md, seccion "Auditoria del
   * modelo real" para la justificacion de cada regla usada aqui. No
   * reimplementa ninguna formula: reutiliza PedidoService y
   * resolveOrderItemProfitabilityCost tal cual existen hoy.
   */
  private async calcularSnapshot(
    period: WeekPeriod
  ): Promise<{ metrics: CierreSemanalMetrics; snapshot: Record<string, unknown> }> {
    const pedidoService = createPedidoService();
    const productoService = createProductoService();
    const pedidoRepository = getPedidoRepository();

    const [dashboard, productos] = await Promise.all([
      pedidoService.obtenerDashboardAdmin(),
      productoService.obtenerCatalogoAdmin()
    ]);

    const allOrders = [
      ...dashboard.pendientes,
      ...dashboard.agendados,
      ...dashboard.finalizados,
      ...dashboard.cancelados
    ];

    const ordersInPeriod = allOrders.filter((order) => estaEnPeriodo(canonicalPedidoFecha(order), period));
    const cancelledInPeriod = dashboard.cancelados.filter((order) =>
      estaEnPeriodo(canonicalPedidoFecha(order), period)
    );
    const pendingBucket = [
      ...dashboard.pendientes,
      ...dashboard.agendados,
      ...dashboard.finalizados.filter((order) => order.estadoPedido !== "ENTREGADO")
    ];
    const pendingInPeriod = pendingBucket.filter((order) => estaEnPeriodo(canonicalPedidoFecha(order), period));
    const deliveredInPeriod = dashboard.finalizados.filter(
      (order) => order.estadoPedido === "ENTREGADO" && estaEnPeriodo(canonicalPedidoFecha(order), period)
    );

    const ventasOrders = dashboard.finalizados.filter((order) => estaEnPeriodo(canonicalVentaFecha(order), period));
    const directSalesInPeriod = ventasOrders.filter((order) => order.origenPedido === "ADMIN_DIRECTO");

    const profitability = calcularRentabilidad(ventasOrders, productos);

    const allPedidoIds = allOrders.map((order) => order.id);
    const [pagos, fiados] = await Promise.all([
      pedidoRepository.buscarPagosPorPedidoIds(allPedidoIds),
      pedidoRepository.buscarFiadosPorPedidoIds(allPedidoIds)
    ]);

    const incomeAmount = pagos
      .filter((pago) => estaEnPeriodo(pago.fechaPago, period))
      .reduce((sum, pago) => sum + pago.monto, 0);

    const outstandingAmount = fiados
      .filter((fiado) => estaEnPeriodo(fiado.fechaFiado, period))
      .reduce((sum, fiado) => sum + fiado.montoPendiente, 0);

    const metrics: CierreSemanalMetrics = {
      ordersCount: ordersInPeriod.length,
      cancelledOrdersCount: cancelledInPeriod.length,
      pendingOrdersCount: pendingInPeriod.length,
      deliveredOrdersCount: deliveredInPeriod.length,
      directSalesCount: directSalesInPeriod.length,
      grossSales: profitability.totalVentas,
      incomeAmount,
      costAmount: profitability.totalCostos,
      profitAmount: profitability.totalUtilidad,
      outstandingAmount
    };

    const snapshot: Record<string, unknown> = {
      ...metrics,
      itemsConCostoEstimado: profitability.estimatedItems,
      itemsSinCosto: profitability.missingItems,
      ventasPorOrigen: profitability.byOrigin
    };

    return { metrics, snapshot };
  }
}

function calcularRentabilidad(ventasOrders: AdminOrderSummary[], productos: AdminProductRecord[]) {
  let totalVentas = 0;
  let totalCostos = 0;
  let totalUtilidad = 0;
  let estimatedItems = 0;
  let missingItems = 0;
  const byOrigin = new Map<string, { pedidos: number; ventaTotal: number }>();

  ventasOrders.forEach((order) => {
    const originKey = order.origenPedido ?? "PUBLICO";
    const origin = byOrigin.get(originKey) ?? { pedidos: 0, ventaTotal: 0 };
    origin.pedidos += 1;

    order.items.forEach((item) => {
      const resolved = resolveOrderItemProfitabilityCost(item, productos);
      totalVentas += item.subtotal;
      origin.ventaTotal += item.subtotal;

      if (resolved.status === "missing") {
        missingItems += 1;
        return;
      }

      totalCostos += resolved.totalCost;
      totalUtilidad += resolved.profit;

      if (resolved.status === "estimated") {
        estimatedItems += 1;
      }
    });

    byOrigin.set(originKey, origin);
  });

  return {
    totalVentas,
    totalCostos,
    totalUtilidad,
    estimatedItems,
    missingItems,
    byOrigin: Object.fromEntries(byOrigin)
  };
}

export function createCierreSemanalService() {
  return new CierreSemanalService();
}
