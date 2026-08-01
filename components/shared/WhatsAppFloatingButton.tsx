"use client";

import { MessageCircle } from "lucide-react";
import { useSyncExternalStore } from "react";
import { buildReservationInviteMessage } from "@/lib/whatsapp/buildReservationInviteMessage";
import { buildWhatsAppShareUrl } from "@/lib/whatsapp/buildWhatsAppShareUrl";
import { buildStorefrontShareMessage } from "@/lib/whatsapp/url";

function subscribeToOrigin() { return () => undefined; }
function getBrowserOrigin() { return window.location.origin; }
function getServerOrigin() { return ""; }

type WhatsAppFloatingButtonProps = {
  hidden?: boolean;
  bottomOffsetClassName?: string;
};

export function WhatsAppFloatingButton({
  hidden = false,
  bottomOffsetClassName = "bottom-[calc(24px+env(safe-area-inset-bottom))]"
}: WhatsAppFloatingButtonProps) {
  const origin = useSyncExternalStore(subscribeToOrigin, getBrowserOrigin, getServerOrigin);

  if (hidden) {
    return null;
  }

  const approvedCopy = process.env.NEXT_PUBLIC_WHATSAPP_SHARE_URL?.trim();
  const shareMessage = approvedCopy || buildReservationInviteMessage();
  const message = origin && shareMessage ? buildStorefrontShareMessage(shareMessage, origin) : null;
  const href = message ? buildWhatsAppShareUrl(message) : null;

  return (
    <a
      href={href ?? "#"}
      aria-disabled={!href}
      onClick={(event) => { if (!href) event.preventDefault(); }}
      aria-label="Compartir mi tiendita"
      title="Compartir mi tiendita"
      className={`fixed right-4 z-30 inline-flex h-12 w-12 items-center justify-center rounded-full border border-[#c1b6ff] bg-[#f5f3ff] text-[#5c431f] shadow-[0_12px_28px_rgba(92,67,31,0.16)] transition hover:bg-[#eeebff] ${bottomOffsetClassName}`}
    >
      <MessageCircle className="h-5 w-5" />
    </a>
  );
}
