"use client";

import { useEffect, useRef } from "react";

export type ConfirmDialogState = {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger" | "warning";
  onConfirm: () => void;
  onCancel: () => void;
} | null;

function getConfirmButtonClassName(tone: "default" | "danger" | "warning" = "default") {
  if (tone === "danger") {
    return "bg-rose-600 text-white hover:bg-rose-700";
  }

  if (tone === "warning") {
    return "bg-amber-500 text-amber-950 hover:bg-amber-400";
  }

  return "bg-emerald-600 text-white hover:bg-emerald-700";
}

export function ConfirmDialog({ state }: { state: ConfirmDialogState }) {
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!state) {
      return;
    }

    const originalOverflow = document.body.style.overflow;

    const frameId = window.requestAnimationFrame(() => {
      confirmButtonRef.current?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        state.onCancel();
        return;
      }

      if (event.key === "Tab") {
        const focusableElements = [cancelButtonRef.current, confirmButtonRef.current].filter(
          (element): element is HTMLButtonElement => Boolean(element)
        );

        if (focusableElements.length === 0) {
          return;
        }

        const activeIndex = focusableElements.findIndex(
          (element) => element === document.activeElement
        );
        const direction = event.shiftKey ? -1 : 1;
        const nextIndex =
          activeIndex === -1
            ? event.shiftKey
              ? focusableElements.length - 1
              : 0
            : (activeIndex + direction + focusableElements.length) % focusableElements.length;

        event.preventDefault();
        focusableElements[nextIndex]?.focus();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [state]);

  if (!state) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-[#1f3328]/40 px-4 backdrop-blur-sm"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Cerrar confirmacion"
        className="absolute inset-0"
        onClick={state.onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-confirm-title"
        aria-describedby="app-confirm-description"
        className="relative w-full max-w-md rounded-[30px] border border-[#d8ebdd] bg-white p-6 shadow-[0_24px_60px_rgba(31,51,40,0.18)]"
      >
        <h2 id="app-confirm-title" className="text-xl font-semibold text-[#1f3328]">
          {state.title}
        </h2>
        <p id="app-confirm-description" className="mt-2 text-sm leading-6 text-[#6b7c70]">
          {state.description}
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={state.onCancel}
            className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-[#d8ebdd] bg-white px-4 py-3 text-sm font-semibold text-[#1f3328]"
          >
            {state.cancelLabel ?? "Volver"}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={state.onConfirm}
            className={`inline-flex min-h-11 items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition ${getConfirmButtonClassName(state.tone)}`}
          >
            {state.confirmLabel ?? "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}
