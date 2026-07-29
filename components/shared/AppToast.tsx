"use client";

import { X } from "lucide-react";

type AppToastProps = {
  message: string;
  tone: "success" | "error" | "info";
  onClose: () => void;
};

export function AppToast({ message, tone, onClose }: AppToastProps) {
  const palette =
    tone === "success"
      ? "border-[#d9c8a0] bg-[#f2ece0] text-[#5c431f]"
      : tone === "error"
        ? "border-[#f2b8b3] bg-[#fff2f1] text-[#b44b43]"
        : "border-[#e3d9c8] bg-white text-[#231f19]";

  return (
    <div
      aria-live={tone === "error" ? "assertive" : "polite"}
      className={`fixed inset-x-4 top-4 z-[70] mx-auto flex max-w-md items-start gap-3 rounded-[22px] border px-4 py-3 shadow-[0_20px_40px_rgba(35, 31, 25,0.14)] backdrop-blur ${palette}`}
      role="status"
    >
      <div className="min-w-0 flex-1 text-sm font-medium leading-6">{message}</div>
      <button
        type="button"
        onClick={onClose}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-current/15 bg-white/70"
        aria-label="Cerrar aviso"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
