import { formatCurrency } from "@/lib/format";

export function buildAdminOrderAlertMessage(input: {
  customerName: string;
  deliveryDateLabel?: string;
  total: number;
  items: Array<{
    name: string;
    quantity: number;
  }>;
}) {
  const lines = [
    "Hola Pauli, entro un nuevo pedido:",
    `Cliente: ${input.customerName.trim() || "Sin nombre"}`,
    `Entrega: ${input.deliveryDateLabel?.trim() || "Por coordinar"}`,
    "Pedido:"
  ];

  if (input.items.length > 0) {
    input.items.forEach((item) => {
      lines.push(`- ${item.quantity}x ${item.name}`);
    });
  } else {
    lines.push("- Sin detalle disponible");
  }

  lines.push(`Total: ${formatCurrency(input.total)}`);
  lines.push("Estado: pendiente de confirmacion");

  return lines.join("\n");
}
