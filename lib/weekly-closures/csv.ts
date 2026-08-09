/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Cierres semanales (Fase 7.6A)
 * Descripcion: Exportacion CSV pura (sin dependencias nuevas) para un
 * cierre semanal. Protege contra CSV injection: cualquier valor de texto
 * que empiece con =, +, -, @ se antepone con un apostrofe para neutralizar
 * su interpretacion como formula en Excel/Sheets. El motivo de reapertura
 * completo nunca se exporta (solo un indicador booleano).
 */

const CSV_INJECTION_PREFIXES = ["=", "+", "-", "@"];

/** Neutraliza CSV injection y escapa comillas/comas/saltos de linea. */
export function escapeCsvValue(raw: string): string {
  let value = raw;

  if (CSV_INJECTION_PREFIXES.some((prefix) => value.startsWith(prefix))) {
    value = `'${value}`;
  }

  if (value.includes(",") || value.includes('"') || value.includes("\n") || value.includes("\r")) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

export type WeeklyClosureCsvInput = {
  id: string;
  periodStart: string;
  periodEndExclusive: string;
  version: number;
  status: string;
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
  closedAt: string;
  closedByEmail?: string | null;
  reopenedAt?: string | null;
  hasReopenReason: boolean;
};

const CSV_ROWS: Array<[string, (input: WeeklyClosureCsvInput) => string]> = [
  ["ID de cierre", (i) => i.id],
  ["Periodo inicio", (i) => i.periodStart],
  ["Periodo fin (exclusivo)", (i) => i.periodEndExclusive],
  ["Version", (i) => String(i.version)],
  ["Estado", (i) => i.status],
  ["Pedidos", (i) => String(i.ordersCount)],
  ["Cancelados", (i) => String(i.cancelledOrdersCount)],
  ["Pendientes", (i) => String(i.pendingOrdersCount)],
  ["Entregados", (i) => String(i.deliveredOrdersCount)],
  ["Ventas directas", (i) => String(i.directSalesCount)],
  ["Ventas", (i) => String(i.grossSales)],
  ["Ingresos (caja)", (i) => String(i.incomeAmount)],
  ["Costos", (i) => String(i.costAmount)],
  ["Utilidad", (i) => String(i.profitAmount)],
  ["Saldo pendiente (fiado)", (i) => String(i.outstandingAmount)],
  ["Cerrado el", (i) => i.closedAt],
  ["Cerrado por", (i) => i.closedByEmail ?? ""],
  ["Reabierto el", (i) => i.reopenedAt ?? ""],
  ["Tiene motivo de reapertura", (i) => (i.hasReopenReason ? "si" : "no")]
];

/** CSV de una sola columna de metadatos (clave, valor) -- no una tabla de filas. */
export function buildWeeklyClosureCsv(input: WeeklyClosureCsvInput): string {
  const lines = ["campo,valor"];

  for (const [label, getValue] of CSV_ROWS) {
    lines.push(`${escapeCsvValue(label)},${escapeCsvValue(getValue(input))}`);
  }

  return lines.join("\r\n");
}

/** Nombre de archivo sugerido para la descarga. */
export function buildWeeklyClosureCsvFilename(periodStartDateInput: string, version: number): string {
  return `smellme-cierre-semanal-${periodStartDateInput}-v${version}.csv`;
}
