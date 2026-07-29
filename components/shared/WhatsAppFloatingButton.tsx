"use client";

import { MessageCircle } from "lucide-react";
import { buildReservationInviteMessage } from "@/lib/whatsapp/buildReservationInviteMessage";
import { buildWhatsAppShareUrl } from "@/lib/whatsapp/buildWhatsAppShareUrl";

type WhatsAppFloatingButtonProps = {
  hidden?: boolean;
  bottomOffsetClassName?: string;
};

export function WhatsAppFloatingButton({
  hidden = false,
  bottomOffsetClassName = "bottom-[calc(24px+env(safe-area-inset-bottom))]"
}: WhatsAppFloatingButtonProps) {
  if (hidden) {
    return null;
  }

  const groupUrl = process.env.NEXT_PUBLIC_WHATSAPP_GROUP_URL?.trim();
  const shareMessage =
    process.env.NEXT_PUBLIC_WHATSAPP_SHARE_URL?.trim() || buildReservationInviteMessage();
  const href = groupUrl || buildWhatsAppShareUrl(shareMessage);

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label="Compartir link de pedidos por WhatsApp"
      title="Compartir link de pedidos"
      className={`fixed right-4 z-30 inline-flex h-12 w-12 items-center justify-center rounded-full border border-[#c1b6ff] bg-[#f5f3ff] text-[#5c431f] shadow-[0_12px_28px_rgba(92,67,31,0.16)] transition hover:bg-[#eeebff] ${bottomOffsetClassName}`}
    >
      <MessageCircle className="h-5 w-5" />
    </a>
  );
}
