import {
  METODO_DESPACHO_LABELS,
  METODO_DESPACHO_STARKEN_POR_PAGAR,
  type MetodoDespacho
} from "@/lib/constants";

export type BuildOrderPaymentConfirmedMessageInput = {
  customerName?: string;
  codigo?: string;
  total?: number;
  metodoDespacho?: MetodoDespacho;
  region?: string;
  comuna?: string;
  direccion?: string;
  referenciaDireccion?: string;
};

function formatCurrencyValue(value: number) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0
  }).format(value);
}

/**
 * Mensaje para la accion "Confirmar pago". Usa solo el snapshot persistido
 * del pedido (total, metodo de despacho, direccion) - nunca inventa una
 * direccion ni recalcula el total. Las lineas de direccion se omiten cuando
 * el dato no existe, en vez de mostrar "undefined"/"null".
 */
export function buildOrderPaymentConfirmedMessage(
  input: BuildOrderPaymentConfirmedMessageInput
) {
  const normalizedName = input.customerName?.trim();
  const header = normalizedName ? `Hola ${normalizedName}` : "Hola";

  const lines = [
    header,
    "",
    input.codigo
      ? `¡Recibimos tu pago! Tu pedido ${input.codigo} quedó confirmado.`
      : "¡Recibimos tu pago! Tu pedido quedó confirmado."
  ];

  if (typeof input.total === "number" && Number.isFinite(input.total)) {
    lines.push("", `Total pagado: ${formatCurrencyValue(input.total)}`);
  }

  const deliveryLines: string[] = [];

  if (input.metodoDespacho) {
    deliveryLines.push(`Modalidad: ${METODO_DESPACHO_LABELS[input.metodoDespacho]}`);
  }

  if (input.region?.trim()) {
    deliveryLines.push(`Región: ${input.region.trim()}`);
  }

  if (input.comuna?.trim()) {
    deliveryLines.push(`Comuna: ${input.comuna.trim()}`);
  }

  const isPickup = input.metodoDespacho === METODO_DESPACHO_STARKEN_POR_PAGAR;

  if (!isPickup && input.direccion?.trim()) {
    deliveryLines.push(`Dirección: ${input.direccion.trim()}`);
  }

  if (!isPickup && input.referenciaDireccion?.trim()) {
    deliveryLines.push(`Referencia: ${input.referenciaDireccion.trim()}`);
  }

  if (deliveryLines.length > 0) {
    lines.push("", "Coordinemos la entrega:", ...deliveryLines);
  }

  if (input.metodoDespacho === METODO_DESPACHO_STARKEN_POR_PAGAR) {
    lines.push("", "Recuerda que el envío se paga directamente en la sucursal Starken al recibir.");
  }

  lines.push(
    "",
    isPickup
      ? "Te contactaremos para coordinar el retiro disponible. Gracias por tu compra."
      : "Te contactaremos para el día de entrega disponible de la semana. Gracias por tu compra."
  );

  return lines.join("\n");
}
