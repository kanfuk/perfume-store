"use client";

import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from "lucide-react";

export type AppToastTone = "success" | "error" | "info" | "warning" | "loading";

export type AppToastItem = {
  id: string;
  message: string;
  tone: AppToastTone;
  actionLabel?: string;
  onAction?: () => void;
};

function getToastIcon(tone: AppToastTone) {
  if (tone === "success") {
    return <CheckCircle2 className="h-5 w-5" />;
  }

  if (tone === "error") {
    return <AlertCircle className="h-5 w-5" />;
  }

  if (tone === "warning") {
    return <TriangleAlert className="h-5 w-5" />;
  }

  if (tone === "loading") {
    return (
      <span className="inline-flex h-5 w-5 animate-spin rounded-full border-2 border-current border-r-transparent" />
    );
  }

  return <Info className="h-5 w-5" />;
}

function getToastPalette(tone: AppToastTone) {
  if (tone === "success") {
    return "border-brand-200 bg-brand-50 text-brand-900";
  }

  if (tone === "error") {
    return "border-rose-200 bg-rose-50 text-rose-900";
  }

  if (tone === "warning") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }

  if (tone === "loading") {
    return "border-slate-200 bg-white text-slate-900";
  }

  return "border-[#e3d9c8] bg-white text-[#231f19]";
}

export function AppToastViewport({
  toasts,
  onClose
}: {
  toasts: AppToastItem[];
  onClose: (id: string) => void;
}) {
  return (
    <div
      aria-atomic="true"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-[120] flex flex-col items-center gap-3 px-4 pt-4 sm:items-end sm:px-6"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-[24px] border px-4 py-3 shadow-[0_20px_40px_rgba(35, 31, 25,0.14)] backdrop-blur ${getToastPalette(toast.tone)}`}
        >
          <div className="mt-0.5 shrink-0">{getToastIcon(toast.tone)}</div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium leading-6">{toast.message}</div>
            {toast.actionLabel && toast.onAction ? (
              <button
                type="button"
                onClick={toast.onAction}
                className="mt-2 inline-flex min-h-11 items-center rounded-2xl border border-current/15 bg-white/75 px-3 py-2 text-sm font-semibold"
              >
                {toast.actionLabel}
              </button>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => onClose(toast.id)}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-current/15 bg-white/70"
            aria-label="Cerrar aviso"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
