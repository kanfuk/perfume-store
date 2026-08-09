"use client";

import { createContext, useEffect, useMemo, useRef, useState } from "react";
import { AppToastViewport, type AppToastItem, type AppToastTone } from "@/components/ui/AppToastViewport";
import { ConfirmDialog, type ConfirmDialogState } from "@/components/ui/ConfirmDialog";

type ConfirmOptions = {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger" | "warning";
};

type NotifyOptions = {
  dedupeKey?: string;
  message: string;
  tone?: AppToastTone;
  durationMs?: number;
  actionLabel?: string;
  onAction?: () => void;
};

export type AppFeedbackContextValue = {
  notify: (options: NotifyOptions) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
  loading: (message: string) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

export const AppFeedbackContext = createContext<AppFeedbackContextValue | null>(null);

function createToastId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function AppFeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<AppToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmDialogState>(null);
  const lastFocusRef = useRef<HTMLElement | null>(null);
  const dismissTimeoutsRef = useRef<number[]>([]);
  const seenDedupeKeysRef = useRef(new Set<string>());

  useEffect(() => {
    return () => {
      dismissTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      dismissTimeoutsRef.current = [];
    };
  }, []);

  const api = useMemo<AppFeedbackContextValue>(
    () => ({
      notify({ message, tone = "info", durationMs = 3600, actionLabel, onAction, dedupeKey }) {
        setToasts((current) => {
          if (dedupeKey && seenDedupeKeysRef.current.has(dedupeKey)) return current;
          const duplicated = current.some((item) => item.message === message && item.tone === tone);

          if (duplicated) {
            return current;
          }

          const id = createToastId();
          if (dedupeKey) seenDedupeKeysRef.current.add(dedupeKey);
          const timeoutId = window.setTimeout(() => {
            setToasts((activeToasts) => activeToasts.filter((item) => item.id !== id));
          }, durationMs);
          dismissTimeoutsRef.current.push(timeoutId);

          return [...current, { id, message, tone, actionLabel, onAction, dedupeKey }];
        });
      },
      success(message) {
        this.notify({ message, tone: "success" });
      },
      error(message) {
        this.notify({ message, tone: "error" });
      },
      info(message) {
        this.notify({ message, tone: "info" });
      },
      warning(message) {
        this.notify({ message, tone: "warning" });
      },
      loading(message) {
        this.notify({ message, tone: "loading", durationMs: 2200 });
      },
      confirm(options) {
        if (typeof document !== "undefined") {
          lastFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }

        return new Promise<boolean>((resolve) => {
          setConfirmState({
            ...options,
            onConfirm: () => {
              setConfirmState(null);
              lastFocusRef.current?.focus();
              resolve(true);
            },
            onCancel: () => {
              setConfirmState(null);
              lastFocusRef.current?.focus();
              resolve(false);
            }
          });
        });
      }
    }),
    []
  );

  return (
    <AppFeedbackContext.Provider value={api}>
      {children}
      <AppToastViewport
        toasts={toasts}
        onClose={(id) => setToasts((current) => current.filter((item) => item.id !== id))}
      />
      <ConfirmDialog state={confirmState} />
    </AppFeedbackContext.Provider>
  );
}
