import { formatChileDateOnly, formatChileDateTime, getChileCurrentMonthRange, getChileTodayInputValue } from "@/lib/date";
import type { AdminOrderSummary, AdminProductRecord } from "@/lib/types";
import type {
  GroupedFiadoCustomer,
  ProfitabilityCostStatus,
  ReportRangePreset,
  ReportSalesFilter,
  ResolvedProfitabilityCost
} from "@/components/admin/dashboard/admin-dashboard.types";

export function formatBadgePermission(value: NotificationPermission | "unsupported") {
  if (value === "granted") {
    return "Permitido";
  }

  if (value === "denied") {
    return "Denegado";
  }

  if (value === "default") {
    return "Pendiente";
  }

  return "Sin soporte";
}

export function resolveBadgeActivationErrorMessage(error: string | null) {
  if (error === "BADGE_NOT_SUPPORTED") {
    return "Este navegador no soporta badge en el icono.";
  }

  if (error === "NOTIFICATION_PERMISSION_DENIED") {
    return "El permiso fue denegado. Debes activarlo desde Ajustes del iPhone para esta app.";
  }

  return "No se pudo activar el badge. Revisa permisos de notificaciones del iPhone o vuelve a abrir la app desde el icono instalado.";
}

export function getCurrentDeviceLabel() {
  if (typeof navigator === "undefined") {
    return "Dispositivo";
  }

  const platform = navigator.platform?.trim();
  return platform ? `iPhone/${platform}` : "iPhone";
}

export function mergeOrderItems(
  current: Array<{ name: string; quantity: number }>,
  incoming: Array<{ name: string; quantity: number }>
) {
  const grouped = new Map<string, number>();

  [...current, ...incoming].forEach((item) => {
    grouped.set(item.name, (grouped.get(item.name) ?? 0) + item.quantity);
  });

  return Array.from(grouped.entries()).map(([name, quantity]) => ({ name, quantity }));
}

export function renderGroupedItemLines(
  items: Array<{ name: string; quantity: number }>,
  visibleLimit = 3
) {
  const grouped = mergeOrderItems([], items);
  const visibleLines = grouped
    .slice(0, visibleLimit)
    .map((item) => `- ${item.quantity} x ${item.name}`);

  if (grouped.length > visibleLimit) {
    visibleLines.push(`+ ${grouped.length - visibleLimit} producto(s) mas`);
  }

  return visibleLines;
}

export function agruparFiadosPorCliente(fiados: AdminOrderSummary[] = []) {
  const groups = new Map<string, GroupedFiadoCustomer>();

  fiados.forEach((fiado) => {
    const clienteId = findGroupedFiadoKey(groups, fiado);

    if (!clienteId) {
      return;
    }

    const current = groups.get(clienteId) ?? {
      clienteId,
      nombre: fiado.clienteNombre || "Cliente sin nombre",
      telefono: fiado.clienteTelefono || "",
      lugarTrabajo: fiado.clienteLugarTrabajo || "",
      totalPendiente: 0,
      cantidadFiados: 0,
      fiados: []
    };

    if (shouldReplaceGroupedCustomerData(current, fiado)) {
      current.clienteId = fiado.clienteId || current.clienteId;
      current.nombre = fiado.clienteNombre || current.nombre;
      current.telefono = fiado.clienteTelefono || current.telefono;
      current.lugarTrabajo = pickBetterWorkplace(current.lugarTrabajo, fiado.clienteLugarTrabajo);
    } else if (!current.lugarTrabajo) {
      current.lugarTrabajo = fiado.clienteLugarTrabajo || current.lugarTrabajo;
    }

    current.totalPendiente += Number(fiado.saldoPendiente || 0);
    current.cantidadFiados += 1;
    current.fiados.push(fiado);

    groups.set(clienteId, current);
  });

  return Array.from(groups.values())
    .map((customer) => ({
      ...customer,
      fiados: [...customer.fiados].sort((a, b) =>
        getFiadoDateValue(b).localeCompare(getFiadoDateValue(a))
      )
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export function findGroupedFiadoKey(
  groups: Map<string, GroupedFiadoCustomer>,
  fiado: AdminOrderSummary
) {
  const normalizedPhone = fiado.clienteTelefono.replace(/\D/g, "");
  const normalizedName = normalizeIdentityValue(fiado.clienteNombre);
  const normalizedWorkplace = normalizeIdentityValue(fiado.clienteLugarTrabajo);

  if (normalizedPhone) {
    const phoneMatch = Array.from(groups.entries()).find(([, customer]) => {
      return customer.telefono.replace(/\D/g, "") === normalizedPhone;
    });

    if (phoneMatch) {
      return phoneMatch[0];
    }
  }

  const nameMatch = Array.from(groups.entries()).find(([, customer]) => {
    const sameName = normalizeIdentityValue(customer.nombre) === normalizedName;

    if (!sameName) {
      return false;
    }

    const customerWorkplace = normalizeIdentityValue(customer.lugarTrabajo);
    const workplacesCompatible =
      !normalizedWorkplace ||
      !customerWorkplace ||
      normalizedWorkplace === customerWorkplace ||
      isWeakCustomerWorkplace(normalizedWorkplace) ||
      isWeakCustomerWorkplace(customerWorkplace);
    const phoneCompatible =
      !normalizedPhone || !customer.telefono || customer.telefono.replace(/\D/g, "") === normalizedPhone;

    return workplacesCompatible && phoneCompatible;
  });

  if (nameMatch) {
    return nameMatch[0];
  }

  return fiado.clienteId || buildCustomerIdentityKey(fiado);
}

export function isWeakCustomerWorkplace(value: string) {
  return (
    value === "" ||
    value === "venta directa" ||
    value === "venta whatsapp manual" ||
    value === "pedido personalizado"
  );
}

export function pickBetterWorkplace(currentValue: string, incomingValue: string) {
  const current = currentValue || "";
  const incoming = incomingValue || "";

  if (!current) {
    return incoming;
  }

  if (!incoming) {
    return current;
  }

  const currentWeak = isWeakCustomerWorkplace(normalizeIdentityValue(current));
  const incomingWeak = isWeakCustomerWorkplace(normalizeIdentityValue(incoming));

  if (currentWeak && !incomingWeak) {
    return incoming;
  }

  if (!currentWeak && incomingWeak) {
    return current;
  }

  return incoming.length > current.length ? incoming : current;
}

export function shouldReplaceGroupedCustomerData(
  current: GroupedFiadoCustomer,
  fiado: AdminOrderSummary
) {
  const currentScore =
    Number(Boolean(current.telefono)) * 4 +
    Number(!isWeakCustomerWorkplace(normalizeIdentityValue(current.lugarTrabajo || ""))) * 2 +
    Number(Boolean(current.lugarTrabajo)) +
    Number(Boolean(current.nombre));
  const incomingScore =
    Number(Boolean(fiado.clienteTelefono)) * 4 +
    Number(
      !isWeakCustomerWorkplace(normalizeIdentityValue(fiado.clienteLugarTrabajo || ""))
    ) *
      2 +
    Number(Boolean(fiado.clienteLugarTrabajo)) +
    Number(Boolean(fiado.clienteNombre));

  return incomingScore > currentScore;
}

export function getFiadoDateValue(order: AdminOrderSummary) {
  return order.fechaFiado || order.fechaPedido || order.fechaAgendado || "";
}

export function formatFiadoDate(order: AdminOrderSummary) {
  const value = getFiadoDateValue(order);
  return value ? formatDateOnly(value) : "Sin fecha";
}

export function getLastDebtPaymentDate(orders: AdminOrderSummary[]) {
  return orders
    .map((order) => order.fechaUltimoPago)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => b.localeCompare(a))[0];
}

export function formatShortDateTime(value: string) {
  return formatChileDateTime(value);
}

export function getCurrentMonthRange(reference = new Date()) {
  return getChileCurrentMonthRange(reference);
}

export function getReportRangePresetValues(preset: Exclude<ReportRangePreset, "custom">) {
  const today = getChileTodayInputValue();
  const todayDate = parseReportDateInput(today);

  if (preset === "today") {
    return { from: today, to: today };
  }

  if (preset === "week") {
    const current = new Date(todayDate);
    const day = current.getDay();
    const diffToMonday = day === 0 ? 6 : day - 1;
    current.setDate(current.getDate() - diffToMonday);
    const from = toDateInputValue(current);
    const to = today;
    return { from, to };
  }

  if (preset === "last-month") {
    const year = todayDate.getFullYear();
    const month = todayDate.getMonth();
    return {
      from: toDateInputValue(new Date(year, month - 1, 1, 12, 0, 0)),
      to: toDateInputValue(new Date(year, month, 0, 12, 0, 0))
    };
  }

  return getCurrentMonthRange(todayDate);
}

export function parseReportDateInput(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return new Date(value);
  }

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0);
}

export function formatPercent(value: number) {
  if (!Number.isFinite(value)) {
    return "0.0%";
  }

  return `${value.toFixed(1)}%`;
}

export function mapOrderOriginToReportFilter(origin?: string): ReportSalesFilter {
  if (origin === "ADMIN_DIRECTO") {
    return "venta-directa";
  }

  if (origin === "PERSONALIZADO") {
    return "venta-personalizada";
  }

  return "pedido-cliente";
}

export function getSalesFilterLabel(value: ReportSalesFilter) {
  if (value === "venta-directa") {
    return "Ventas directas";
  }

  if (value === "venta-personalizada") {
    return "Ventas personalizadas";
  }

  if (value === "pedido-cliente") {
    return "Pedidos cliente";
  }

  return "Todos";
}

export function getCostStatusTone(status: ProfitabilityCostStatus) {
  if (status === "real") {
    return "pedido" as const;
  }

  if (status === "estimated") {
    return "warning" as const;
  }

  return "neutral" as const;
}

export function getCostStatusLabel(status: ProfitabilityCostStatus) {
  if (status === "real") {
    return "Costo real";
  }

  if (status === "estimated") {
    return "Costo estimado";
  }

  return "Sin precio";
}

export function getCostStatusCompactLabel(status: ProfitabilityCostStatus) {
  if (status === "real") {
    return "REAL";
  }

  if (status === "estimated") {
    return "ESTIMADO";
  }

  return "SIN DATA";
}

export function getProductCostStatus(product: AdminProductRecord): ProfitabilityCostStatus {
  if (product.costoUnitario > 0) {
    return "real";
  }

  if (product.precioVenta > 0) {
    return "estimated";
  }

  return "missing";
}

export function resolveOrderItemProfitabilityCost(
  item: AdminOrderSummary["items"][number],
  products: AdminProductRecord[]
): ResolvedProfitabilityCost {
  const quantity = Math.max(0, item.cantidad ?? 0);
  const currentProduct = item.productoId
    ? products.find((product) => product.id === item.productoId)
    : undefined;
  const savedTotalCost = item.costoTotal ?? 0;
  const savedUnitCost = item.costoUnitario ?? 0;

  if (savedTotalCost > 0) {
    return {
      status: "real",
      unitCost: quantity > 0 ? savedTotalCost / quantity : savedUnitCost,
      totalCost: savedTotalCost,
      profit: item.subtotal - savedTotalCost
    };
  }

  if (savedUnitCost > 0 && quantity > 0) {
    const totalCost = savedUnitCost * quantity;
    return {
      status: "real",
      unitCost: savedUnitCost,
      totalCost,
      profit: item.subtotal - totalCost
    };
  }

  if ((currentProduct?.costoUnitario ?? 0) > 0 && quantity > 0) {
    const unitCost = currentProduct?.costoUnitario ?? 0;
    const totalCost = unitCost * quantity;
    return {
      status: "real",
      unitCost,
      totalCost,
      profit: item.subtotal - totalCost
    };
  }

  const salesAmount =
    item.subtotal > 0
      ? item.subtotal
      : item.precioUnitario > 0 && quantity > 0
        ? item.precioUnitario * quantity
        : (currentProduct?.precioVenta ?? 0) * quantity;

  if (salesAmount > 0) {
    const totalCost = salesAmount * 0.5;
    return {
      status: "estimated",
      unitCost: quantity > 0 ? totalCost / quantity : totalCost,
      totalCost,
      profit: item.subtotal - totalCost
    };
  }

  return {
    status: "missing",
    unitCost: 0,
    totalCost: 0,
    profit: 0
  };
}

export function formatDateOnly(value: string) {
  return formatChileDateOnly(value);
}

export function normalizeIdentityValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function buildCustomerIdentityKey(order: {
  clienteNombre: string;
  clienteTelefono: string;
  clienteLugarTrabajo: string;
}) {
  const normalizedPhone = order.clienteTelefono.replace(/\D/g, "");

  if (normalizedPhone) {
    return normalizedPhone;
  }

  return [
    normalizeIdentityValue(order.clienteNombre),
    normalizeIdentityValue(order.clienteLugarTrabajo)
  ].join("__");
}

export function isRecentCustomerMovement(value: string) {
  const movementDate = new Date(value);

  if (Number.isNaN(movementDate.getTime())) {
    return false;
  }

  const diffInDays = (Date.now() - movementDate.getTime()) / (1000 * 60 * 60 * 24);
  return diffInDays <= 14;
}

export function todayDateValue() {
  return getChileTodayInputValue();
}

export function buttonToneClass(tone: "primary" | "warning" | "muted") {
  if (tone === "primary") {
    return "inline-flex min-h-11 items-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm";
  }

  if (tone === "warning") {
    return "inline-flex min-h-11 items-center rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800";
  }

  return "inline-flex min-h-11 items-center rounded-xl border border-emerald-100 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-900";
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
