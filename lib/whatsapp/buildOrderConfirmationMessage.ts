export type OrderConfirmationMessageItem = {
  name: string;
  quantity: number;
};

export type BuildOrderConfirmationMessageInput = {
  customerName?: string;
  items: OrderConfirmationMessageItem[];
  total?: number;
  deliveryDateLabel?: string;
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
    "Tu pedido en Pauli Store fue confirmado:",
    "",
    ...itemLines
  ];

  if (typeof input.total === "number" && Number.isFinite(input.total)) {
    lines.push("", `Total: ${formatCurrencyValue(input.total)}`);
  }

  lines.push(`Retiro/entrega: ${input.deliveryDateLabel?.trim() || "Por coordinar"}`);
  lines.push("", "Gracias por tu compra.");

  return lines.join("\n");
}
