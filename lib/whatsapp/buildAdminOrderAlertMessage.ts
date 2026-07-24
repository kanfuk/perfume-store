import { METODO_DESPACHO_LABELS, type MetodoDespacho } from "@/lib/constants";
import { formatCurrency } from "@/lib/format";

export function buildAdminOrderAlertMessage(input: {
  customerName: string;
  codigo?: string;
  total: number;
  metodoDespacho?: MetodoDespacho;
  costoDespacho?: number;
  items: Array<{
    name: string;
    quantity: number;
  }>;
}) {
  const lines = [
    "Nuevo pedido recibido:",
    `Codigo: ${input.codigo ?? "Sin codigo"}`,
    `Cliente: ${input.customerName.trim() || "Sin nombre"}`
  ];

  if (input.metodoDespacho) {
    const despachoCosto =
      typeof input.costoDespacho === "number" && input.costoDespacho > 0
        ? formatCurrency(input.costoDespacho)
        : "Por pagar";
    lines.push(`Despacho: ${METODO_DESPACHO_LABELS[input.metodoDespacho]} (${despachoCosto})`);
  }

  lines.push("Pedido:");

  if (input.items.length > 0) {
    input.items.forEach((item) => {
      lines.push(`- ${item.quantity}x ${item.name}`);
    });
  } else {
    lines.push("- Sin detalle disponible");
  }

  lines.push(`Total: ${formatCurrency(input.total)}`);
  lines.push("Estado: nuevo, pendiente de confirmacion");

  return lines.join("\n");
}
