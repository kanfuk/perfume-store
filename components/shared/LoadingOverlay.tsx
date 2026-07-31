"use client";

import { Loader2 } from "lucide-react";

type LoadingOverlayProps = {
  message: string;
  subMessage?: string;
};

/**
 * Overlay de carga centrado y bloqueante (pantalla completa) para
 * operaciones que tardan y no deben sentirse "colgadas": el fixed
 * inset-0 garantiza que sea visible sin depender de la posicion de
 * scroll del usuario. Reutilizable en cualquier flujo (admin o
 * storefront) que necesite comunicar una espera real de forma clara.
 */
export function LoadingOverlay({ message, subMessage }: LoadingOverlayProps) {
  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-[#111318]/45 px-4 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
    >
      <div
        aria-live="assertive"
        role="status"
        className="flex w-full max-w-xs flex-col items-center gap-4 rounded-[26px] border border-[#e4e7ec] bg-white px-6 py-8 text-center shadow-[0_30px_70px_rgba(17,19,24,0.35)]"
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#f5f3ff] text-[#7357ff]">
          <Loader2 className="h-7 w-7 animate-spin" strokeWidth={2} />
        </span>
        <div className="space-y-1">
          <p className="text-base font-semibold text-[#111318]">{message}</p>
          {subMessage ? <p className="text-sm text-[#667085]">{subMessage}</p> : null}
        </div>
      </div>
    </div>
  );
}
