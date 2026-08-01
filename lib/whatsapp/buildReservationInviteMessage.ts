import { reservationInviteMessage } from "@/config/whatsappMessages";
import { buildStorefrontShareMessage } from "@/lib/whatsapp/url";

export function buildReservationInviteMessage(origin?: string | null) {
  return origin ? buildStorefrontShareMessage(reservationInviteMessage, origin) : reservationInviteMessage;
}
