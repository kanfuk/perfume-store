type PendingAdminOrderLike = {
  estadoPedido?: string;
  adminSeen?: boolean;
  fechaEntrega?: string;
  fechaAgendado?: string;
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
  return (
    Boolean(order.fechaAgendado) ||
    status.includes("agendado") ||
    status.includes("confirmado")
  );
}

export function isPendingAdminOrder(order: PendingAdminOrderLike) {
  if (isClosedAdminOrder(order)) {
    return false;
  }

  if (isScheduledAdminOrder(order)) {
    return false;
  }

  return true;
}

export function needsAdminOrderAttention(order: PendingAdminOrderLike) {
  return isPendingAdminOrder(order) && order.adminSeen !== true;
}

export function getPendingAdminOrders<T extends PendingAdminOrderLike>(orders: T[]) {
  if (!Array.isArray(orders)) {
    return [];
  }

  return orders.filter((order) => isPendingAdminOrder(order));
}

export function getPendingAdminOrdersCount<T extends PendingAdminOrderLike>(orders: T[]) {
  return getPendingAdminOrders(orders).length;
}

export function getNewAdminOrders<T extends PendingAdminOrderLike>(orders: T[]) {
  if (!Array.isArray(orders)) {
    return [];
  }

  return orders.filter((order) => needsAdminOrderAttention(order));
}

export function getNewAdminOrdersCount<T extends PendingAdminOrderLike>(orders: T[]) {
  return getNewAdminOrders(orders).length;
}
