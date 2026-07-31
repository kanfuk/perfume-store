import { formatCurrency } from "@/lib/format";

type DebtCollectionItem = {
  name: string;
  quantity: number;
};

type BuildDebtCollectionMessageInput = {
  customerName?: string;
  amount: number;
  items: DebtCollectionItem[];
};

function waSunEmoji() {
  return String.fromCodePoint(0x2600, 0xfe0f);
}

function waHeartEmoji() {
  return String.fromCodePoint(0x1f49b);
}

function waSparklesEmoji() {
  return String.fromCodePoint(0x2728);
}

function waMemoEmoji() {
  return String.fromCodePoint(0x1f4dd);
}

function waHugEmoji() {
  return String.fromCodePoint(0x1f917);
}

export function buildDebtCollectionMessage(input: BuildDebtCollectionMessageInput) {
  const detailLines =
    input.items.length > 0
      ? input.items.map((item) => `- ${item.quantity} x ${item.name}`)
      : ["- Pedido pendiente"];
  const greetingLines = input.customerName ? [`Hola ${input.customerName},`, ""] : [];

  return [
    `Buenas tardes! ${waSunEmoji()}`,
    "",
    ...greetingLines,
    `Muchas gracias por preferir Smellme.cl ${waHeartEmoji()}`,
    "Le env\u00EDo el detalle de su cuenta:",
    "",
    `${waSparklesEmoji()}Monto total: ${formatCurrency(input.amount)}`,
    `${waMemoEmoji()}Detalle:`,
    ...detailLines,
    "",
    "Escríbeme por este mismo medio para coordinar la forma de pago.",
    "",
    `¡Muchas gracias nuevamente! ${waHugEmoji()}`
  ].join("\n");
}
