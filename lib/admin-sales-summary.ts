/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Panel admin - resumen de ventas confirmadas para la pestaña "Ventas".
 * Descripcion: La pestaña "Ventas" (vista "cobros") solo mostraba pedidos
 * agendados por cobrar y fiados abiertos: una venta ya cerrada y pagada
 * (publica, directa o personalizada) no tenia ninguna representacion ahi,
 * aunque si se contabilizara correctamente en Reportes. Funcion pura para
 * poder probarla sin levantar el componente (el proyecto no tiene
 * jsdom/React Testing Library). No modifica Reportes ni contratos de base
 * de datos: solo lee `AdminDashboardData.finalizados`, ya calculado por
 * `pedidoService.obtenerDashboardAdmin()`.
 */

import { ESTADO_PAGO_PAGADO, ESTADO_PEDIDO_CANCELADO } from "@/lib/constants";
import type { AdminOrderSummary, OrderOrigin } from "@/lib/types";
import { getSalesAccountingDate } from "@/lib/sales-accounting-date";

const CONFIRMED_SALE_ORIGINS: ReadonlySet<OrderOrigin> = new Set(["PUBLICO", "ADMIN_DIRECTO", "PERSONALIZADO"]);

export type ConfirmedSalesSummary = {
  /** Cantidad total de ventas confirmadas que cumplen el criterio (no solo las visibles). */
  total: number;
  /** Las `limit` mas recientes, orden descendente por fecha efectiva. */
  recent: AdminOrderSummary[];
};

/**
 * Ventas confirmadas: pagadas (estadoPago PAGADO), no canceladas, de
 * cualquiera de los tres origenes reales (publica, directa, personalizada).
 * Nunca duplica: cada pedido de `finalizados` aparece a lo sumo una vez,
 * porque es un filtro simple sobre una lista de pedidos ya unicos por id.
 */
export function selectRecentConfirmedSales(
  finalizados: AdminOrderSummary[],
  limit = 8
): ConfirmedSalesSummary {
  const confirmed = finalizados.filter(
    (order) =>
      order.estadoPago === ESTADO_PAGO_PAGADO &&
      order.estadoPedido !== ESTADO_PEDIDO_CANCELADO &&
      order.origenPedido !== undefined &&
      CONFIRMED_SALE_ORIGINS.has(order.origenPedido)
  );

  const sorted = [...confirmed].sort((a, b) =>
    getSalesAccountingDate(b).localeCompare(getSalesAccountingDate(a))
  );

  return { total: sorted.length, recent: sorted.slice(0, limit) };
}
