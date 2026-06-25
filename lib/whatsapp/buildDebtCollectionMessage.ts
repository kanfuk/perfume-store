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
    "Buenas tardes! ☀️",
    "",
    "Muchas gracias por preferirme esta semana para acompanar sus desayunos 💛",
    "Le envio el detalle de su cuenta:",
    "",
    `✨Monto total: ${formatCurrency(input.amount)}`,
    "📝Detalle:",
    ...detailLines,
    "",
    "Le dejo mis datos para transferencia.",
    "",
    "Muchas gracias nuevamente! 🤗",
    "",
    paymentInfo.accountHolder,
    paymentInfo.rut,
    paymentInfo.bank,
    paymentInfo.accountType,
    paymentInfo.accountNumber,
    paymentInfo.email
  ].join("\n");
}
