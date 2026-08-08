import type { PaymentInfo } from "@/config/paymentInfo";

export type OrderPaymentRequestMessageItem = {
  name: string;
  quantity: number;
};

export type BuildOrderPaymentRequestMessageInput = {
  customerName?: string;
  codigo?: string;
  items: OrderPaymentRequestMessageItem[];
  subtotal?: number;
  costoDespacho?: number;
  total?: number;
  bankData: PaymentInfo;
};

function formatCurrencyValue(value: number) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0
  }).format(value);
}

/**
 * Mensaje para la accion "Atender y solicitar transferencia". Usa solo el
 * snapshot persistido del pedido (items/subtotal/despacho/total) y los datos
 * bancarios que el servicio servidor resuelve desde la cuenta del ADMIN y
 * conserva en una bitacora historica - nunca
 * precios recalculados ni datos bancarios enviados por el navegador. El
 * llamador valida la configuracion antes de invocar esta funcion; aqui no se
 * rellenan valores faltantes, solo se omiten lineas vacias para nunca mostrar
 * "undefined" o "null".
 */
export function buildOrderPaymentRequestMessage(
  input: BuildOrderPaymentRequestMessageInput
) {
  const normalizedName = input.customerName?.trim();
  const header = normalizedName ? `Hola ${normalizedName}` : "Hola";
  const itemLines =
    input.items.length > 0
      ? input.items.map((item) => `- ${item.quantity} x ${item.name}`)
      : [];

  const lines = [
    header,
    "",
    input.codigo
      ? `Tu pedido ${input.codigo} quedo confirmado y ya podemos coordinar el pago:`
      : "Tu pedido quedo confirmado y ya podemos coordinar el pago:",
    "",
    ...itemLines
  ];

  if (typeof input.subtotal === "number" && Number.isFinite(input.subtotal)) {
    lines.push("", `Subtotal: ${formatCurrencyValue(input.subtotal)}`);
  }

  if (typeof input.costoDespacho === "number" && input.costoDespacho > 0) {
    lines.push(`Despacho: ${formatCurrencyValue(input.costoDespacho)}`);
  }

  if (typeof input.total === "number" && Number.isFinite(input.total)) {
    lines.push(`Total: ${formatCurrencyValue(input.total)}`);
  }

  const bankLines = [
    input.bankData.accountHolder.trim() ? `Titular: ${input.bankData.accountHolder.trim()}` : "",
    input.bankData.rut.trim() ? `RUT: ${input.bankData.rut.trim()}` : "",
    input.bankData.bank.trim() ? `Banco: ${input.bankData.bank.trim()}` : "",
    input.bankData.accountType.trim() ? `Tipo de cuenta: ${input.bankData.accountType.trim()}` : "",
    input.bankData.accountNumber.trim()
      ? `N° de cuenta: ${input.bankData.accountNumber.trim()}`
      : "",
    input.bankData.email.trim() ? `Correo: ${input.bankData.email.trim()}` : ""
  ].filter((line) => line !== "");

  if (bankLines.length > 0) {
    lines.push("", "Datos para la transferencia:", ...bankLines);
  }

  lines.push(
    "",
    "Cuando hagas la transferencia, envianos el comprobante por este mismo medio y coordinamos la entrega.",
    "",
    "Gracias por tu compra."
  );

  return lines.join("\n");
}
