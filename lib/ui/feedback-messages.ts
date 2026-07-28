export const feedbackMessages = {
  orderSubmitted: "Pedido registrado. Pauli confirmara disponibilidad por WhatsApp.",
  orderSubmitError: "No se pudo registrar el pedido. Revisa los datos e intenta nuevamente.",
  productAdded: "Producto agregado al pedido.",
  productRemoved: "Producto quitado del pedido.",
  quantityUpdated: "Cantidad actualizada.",
  stockLimit: "No queda stock suficiente para esa cantidad.",
  directSaleSaved: "Venta directa registrada correctamente.",
  customOrderSaved: "Pedido personalizado registrado correctamente.",
  adminActionError: "No pudimos completar la accion. Intenta nuevamente.",
  confirmDeleteProductTitle: "Eliminar producto",
  confirmDirectSaleTitle: "Registrar venta directa",
  confirmMaintenanceTitle: "Confirmar mantenimiento",
  confirmSensitiveOrderTitle: "Confirmar accion del pedido",
  confirmSensitiveOrderDescription:
    "Revisa la accion antes de continuar. El cambio impacta el estado operativo del pedido.",
  adminPasswordRecoveryInvalidEmail: "Ingresa un correo electrónico válido.",
  adminPasswordRecoveryRequested:
    "Si el correo está registrado, recibirás un enlace para definir tu contraseña."
} as const;

export function formatPendingOrdersLabel(count: number) {
  return `${count} pedido${count === 1 ? "" : "s"} pendiente${count === 1 ? "" : "s"}`;
}

export function formatDirectSaleConfirmationDescription(total: number) {
  return `Se registrara una venta por ${new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0
  }).format(total)} con los productos y totales actuales.`;
}

export function getMaintenanceConfirmationMessage(action: "close-month" | "clear-test-data") {
  if (action === "close-month") {
    return "Esta accion archivara la operacion actual y dejara pedidos, pagos, fiados y clientes en blanco. Productos y stock se conservan.";
  }

  return "Esta accion eliminara los datos operativos de prueba del lanzamiento. Productos y stock se conservan.";
}

export function getProductDeleteConfirmationDescription(productName: string) {
  return `Se intentara eliminar "${productName}" del catalogo. Si ya tiene pedidos asociados, el sistema no permitira borrarlo y deberas dejarlo pausado.`;
}
