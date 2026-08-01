import { buildWhatsAppRecipientUrl } from "@/lib/whatsapp/url";

export function buildWhatsAppManualUrl(phone: string, message: string) {
  return buildWhatsAppRecipientUrl(phone, message) ?? "";
}
