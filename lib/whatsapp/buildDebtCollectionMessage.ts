import { paymentInfo } from "@/config/paymentInfo";
import { formatCurrency } from "@/lib/format";

type DebtCollectionItem = {
  name: string;
  quantity: number;
};

type BuildDebtCollectionMessageInput = {
  amount: number;
  items: DebtCollectionItem[];
};

export function buildDebtCollectionMessage(input: BuildDebtCollectionMessageInput) {
  const detailLines =
    input.items.length > 0
      ? input.items.map((item) => `- ${item.quantity} x ${item.name}`)
      : ["- Pedido pendiente"];

  return [
    "Buenas tardes! \u2600\uFE0F",
    "",
    "Muchas gracias por preferirme esta semana para acompa\u00F1ar sus desayunos \u{1F49B}",
    "Le env\u00EDo el detalle de su cuenta:",
    "",
    `\u2728Monto total: ${formatCurrency(input.amount)}`,
    "\u{1F4DD}Detalle:",
    ...detailLines,
    "",
    "Le dejo mis datos para transferencia.",
    "",
    "Muchas gracias nuevamente! \u{1F917}",
    "",
    paymentInfo.accountHolder,
    paymentInfo.rut,
    paymentInfo.bank,
    paymentInfo.accountType,
    paymentInfo.accountNumber,
    paymentInfo.email
  ].join("\n");
}
