"use client";

import { BellRing } from "lucide-react";

type AdminNotificationBadgeProps = {
  count: number;
  onClick: () => void;
};

function formatCount(count: number) {
  if (count > 99) {
    return "99+";
  }

  if (count > 9) {
    return "9+";
  }

  return String(count);
}

export function AdminNotificationBadge({
  count,
  onClick
}: AdminNotificationBadgeProps) {
  if (count <= 0) {
    return null;
  }

  const visibleCount = formatCount(count);
  const label = `${count} pedido(s) nuevos o sin agendar`;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="fixed right-4 top-[calc(16px+env(safe-area-inset-top))] z-30 inline-flex min-h-11 items-center gap-3 rounded-full border border-[#e3d9c8] bg-white/96 px-4 py-2.5 text-left text-[#3a2b16] shadow-[0_14px_36px_rgba(58, 43, 22,0.18)] backdrop-blur sm:right-6"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#E7F7EC] text-[#1F7A4A] shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
        <BellRing className="h-5 w-5" />
      </span>
      <span className="hidden min-w-0 sm:block">
        <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-[#4B6A59]">
          Pedidos por atender
        </span>
        <span className="block text-sm font-semibold text-[#231f19]">
          Revisar pendientes
        </span>
      </span>
      <span className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-full bg-[#D66D63] px-2 text-sm font-bold text-white shadow-[0_8px_18px_rgba(214,109,99,0.28)]">
        {visibleCount}
      </span>
    </button>
  );
}
