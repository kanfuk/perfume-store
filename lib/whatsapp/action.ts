import type { AdminOrdersAction } from "@/lib/types";
import { buildWhatsAppRecipientUrl } from "@/lib/whatsapp/url";

export function createWhatsAppActionState(input: {
  message: string;
  phone?: string | null;
  orderId: string;
  action: AdminOrdersAction;
}) {
  if (!input.message.trim()) return null;
  const url = input.phone ? buildWhatsAppRecipientUrl(input.phone, input.message) : null;
  return {
    message: input.message,
    url: url ?? undefined,
    reason: url ? "ready" as const : "invalid-phone" as const,
    orderId: input.orderId,
    action: input.action
  };
}
