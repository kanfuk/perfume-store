import { paymentInfo } from "@/config/paymentInfo";
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

export function buildDebtCollectionMessage(input: BuildDebtCollectionMessageInput) {
  const detailLines =
    input.items.length > 0
      ? input.items.map((item) => `- ${item.quantity} x ${item.name}`)
      : ["- Pedido pendiente"];
  const greetingLines = input.customerName ? [`Hola ${input.customerName},`, ""] : [];

  return [
    "Buenas tardes! \u2600\uFE0F",
    "",
    ...greetingLines,
    "Muchas gracias por preferirme esta semana para acompa\u00F1ar sus desayunos \ud83d\udc9b",
    "Le env\u00EDo el detalle de su cuenta:",
    "",
    `\u2728Monto total: ${formatCurrency(input.amount)}`,
    "\ud83d\udcddDetalle:",
    ...detailLines,
    "",
    "Le dejo mis datos para transferencia.",
    "",
    "Muchas gracias nuevamente! \ud83e\udd17",
    "",
    paymentInfo.accountHolder,
    paymentInfo.rut,
    paymentInfo.bank,
    paymentInfo.accountType,
    paymentInfo.accountNumber,
    paymentInfo.email
  ].join("\n");
}
