/** Fecha contable de una venta. La entrega es logística y nunca altera el período de venta. */
export type SalesAccountingDateSource = {
  fechaPedido: string;
  fechaPago?: string;
  fechaConfirmacion?: string;
  fechaFinalizacion?: string;
};

const CHILE_TIME_ZONE = "America/Santiago";

export function getSalesAccountingDate(order: SalesAccountingDateSource): string {
  return order.fechaPago ?? order.fechaConfirmacion ?? order.fechaFinalizacion ?? order.fechaPedido;
}

/** YYYY-MM-DD calculado en America/Santiago, incluso cerca de medianoche UTC. */
export function getSalesAccountingDateKey(order: SalesAccountingDateSource): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CHILE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(getSalesAccountingDate(order)));
}

export function filterOrdersByAccountingRange<T extends SalesAccountingDateSource>(
  orders: readonly T[],
  from?: string,
  to?: string
): T[] {
  return orders.filter((order) => {
    const dateKey = getSalesAccountingDateKey(order);
    return (!from || dateKey >= from) && (!to || dateKey <= to);
  });
}
