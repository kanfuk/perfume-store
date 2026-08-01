const WHATSAPP_ORIGIN = "https://wa.me";
const MAX_WHATSAPP_MESSAGE_LENGTH = 4_000;

export function normalizeWhatsAppPhone(phone: string | null | undefined) {
  const digits = phone?.replace(/\D/g, "") ?? "";
  if (/^569\d{8}$/.test(digits)) return digits;
  if (/^9\d{8}$/.test(digits)) return `56${digits}`;
  if (/^09\d{8}$/.test(digits)) return `56${digits.slice(1)}`;
  return null;
}

export function normalizeWhatsAppMessage(message: string | null | undefined) {
  const normalized = message?.replace(/\r\n?/g, "\n").trim() ?? "";
  return normalized.slice(0, MAX_WHATSAPP_MESSAGE_LENGTH);
}

export function buildWhatsAppRecipientUrl(phone: string, message: string) {
  const normalizedPhone = normalizeWhatsAppPhone(phone);
  const normalizedMessage = normalizeWhatsAppMessage(message);
  if (!normalizedPhone || !normalizedMessage) return null;
  return `${WHATSAPP_ORIGIN}/${normalizedPhone}?text=${encodeURIComponent(normalizedMessage)}`;
}

export function buildWhatsAppShareUrl(message: string) {
  const normalizedMessage = normalizeWhatsAppMessage(message);
  if (!normalizedMessage) return null;
  return `${WHATSAPP_ORIGIN}/?text=${encodeURIComponent(normalizedMessage)}`;
}

export function isValidWhatsAppUrl(value: string | null | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "wa.me" &&
      Boolean(url.searchParams.get("text"));
  } catch {
    return false;
  }
}

export function resolveStorefrontRoot(origin: string | null | undefined) {
  if (!origin) return null;
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    return new URL("/", url.origin).toString();
  } catch {
    return null;
  }
}

export function buildStorefrontShareMessage(message: string, origin: string | null | undefined) {
  const root = resolveStorefrontRoot(origin);
  const base = normalizeWhatsAppMessage(message);
  if (!root || !base) return null;
  return `${base}\n\n${root}`;
}
