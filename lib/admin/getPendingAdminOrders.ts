type PendingAdminOrderLike = {
  estadoPedido?: string;
  adminSeen?: boolean;
  fechaEntrega?: string;
};

function normalizeStatus(value?: string) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export function isClosedAdminOrder(order: PendingAdminOrderLike) {
  const status = normalizeStatus(order.estadoPedido);

  return (
    status.includes("finalizado") ||
    status.includes("cancelado") ||
    status.includes("cerrado") ||
    status.includes("entregado")
  );
}

export function isScheduledAdminOrder(order: PendingAdminOrderLike) {
  const status = normalizeStatus(order.estadoPedido);
  return Boolean(order.fechaEntrega) || status.includes("agendado") || status.includes("confirmado");
}

export function needsAdminOrderAttention(order: PendingAdminOrderLike) {
  if (isClosedAdminOrder(order)) {
    return false;
  }

  const isSeen = order.adminSeen === true;
  const isScheduled = isScheduledAdminOrder(order);

  return !isScheduled || !isSeen;
}

export function getPendingAdminOrders<T extends PendingAdminOrderLike>(orders: T[]) {
  if (!Array.isArray(orders)) {
    return [];
  }

  return orders.filter((order) => needsAdminOrderAttention(order));
}

export function getPendingAdminOrdersCount<T extends PendingAdminOrderLike>(orders: T[]) {
  return getPendingAdminOrders(orders).length;
}
