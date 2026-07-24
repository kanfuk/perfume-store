import { METODO_DESPACHO_LABELS, type MetodoDespacho } from "@/lib/constants";

export type OrderConfirmationMessageItem = {
  name: string;
  quantity: number;
};

export type BuildOrderConfirmationMessageInput = {
  customerName?: string;
  codigo?: string;
  items: OrderConfirmationMessageItem[];
  subtotal?: number;
  costoDespacho?: number;
  total?: number;
  metodoDespacho?: MetodoDespacho;
  direccion?: string;
};

function formatCurrencyValue(value: number) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0
  }).format(value);
}

export function buildOrderConfirmationMessage(
  input: BuildOrderConfirmationMessageInput
) {
  const normalizedName = input.customerName?.trim();
  const header = normalizedName ? `Hola ${normalizedName}` : "Hola";
  const itemLines =
    input.items.length > 0
      ? input.items.map((item) => `- ${item.quantity} x ${item.name}`)
      : ["Tu pedido fue confirmado correctamente."];
  const lines = [
    header,
    "",
    input.codigo ? `Tu pedido ${input.codigo} fue confirmado:` : "Tu pedido fue confirmado:",
    "",
    ...itemLines
  ];

  if (typeof input.subtotal === "number" && Number.isFinite(input.subtotal)) {
    lines.push("", `Subtotal: ${formatCurrencyValue(input.subtotal)}`);
  }

  if (input.metodoDespacho) {
    const despachoLabel = METODO_DESPACHO_LABELS[input.metodoDespacho];
    const despachoCosto =
      typeof input.costoDespacho === "number" && input.costoDespacho > 0
        ? formatCurrencyValue(input.costoDespacho)
        : "Por pagar";
    lines.push(`Despacho: ${despachoLabel} (${despachoCosto})`);
  }

  if (typeof input.total === "number" && Number.isFinite(input.total)) {
    lines.push(`Total: ${formatCurrencyValue(input.total)}`);
  }

  if (input.direccion?.trim()) {
    lines.push(`Direccion: ${input.direccion.trim()}`);
  }

  lines.push("", "Coordinaremos el pago por transferencia y el despacho por este medio.");
  lines.push("", "Gracias por tu compra.");

  return lines.join("\n");
}
