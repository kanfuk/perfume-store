"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, BellOff, RefreshCcw } from "lucide-react";
import { useAdminPushSettings } from "@/hooks/useAdminPushSettings";
import {
  dismissAdminPushPrompt,
  getAdminPushPromptKind,
  isAdminPushPromptDismissed
} from "@/lib/pwa/admin-push-state";

export function AdminPushDashboardPrompt({
  pendingCount,
  showPrompt
}: {
  pendingCount: number;
  showPrompt: boolean;
}) {
  const push = useAdminPushSettings(pendingCount);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(isAdminPushPromptDismissed(window.sessionStorage));
  }, []);

  const kind = getAdminPushPromptKind({
    loaded: push.loaded,
    pushSupported: push.pushSupported,
    permission: push.permission,
    subscriptionActive: push.subscriptionActive
  });

  if (!showPrompt || dismissed || !kind) return null;

  const dismiss = () => {
    dismissAdminPushPrompt(window.sessionStorage);
    setDismissed(true);
  };
  const blocked = kind === "blocked";
  const repair = kind === "repair";
  const unsupported = kind === "unsupported";
  const title = blocked
    ? "Notificaciones bloqueadas"
    : repair
      ? "Reactiva las notificaciones"
      : unsupported
        ? "Notificaciones no compatibles"
        : "Activa las notificaciones";
  const description = blocked
    ? "Habilita las notificaciones desde la configuracion del navegador o del sistema y vuelve para reparar la suscripcion."
    : repair
      ? "El permiso esta concedido, pero falta una suscripcion valida en este dispositivo."
      : unsupported
        ? "Este navegador o dispositivo no admite Web Push. Puedes revisar el diagnostico completo en Configuracion."
        : "Recibe avisos de nuevos pedidos aunque Smellme no esté abierta.";

  return (
    <div
      className="fixed inset-0 z-[130] flex items-end justify-center bg-brand-950/40 px-3 pt-6 sm:items-center sm:p-6"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-push-prompt-title"
        className="relative w-full max-w-md rounded-t-[28px] border border-brand-100 bg-white p-6 pb-[calc(24px+env(safe-area-inset-bottom))] shadow-[0_-20px_60px_rgba(17,19,24,0.24)] sm:rounded-[28px] sm:pb-6"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-100 text-brand-800">
          {blocked || unsupported ? <BellOff className="h-6 w-6" /> : <Bell className="h-6 w-6" />}
        </div>
        <h2 id="admin-push-prompt-title" className="mt-4 text-xl font-bold text-brand-950">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-brand-900/70">{description}</p>
        {push.error ? <p className="mt-3 text-sm font-semibold text-rose-700">{push.error}</p> : null}

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {blocked || unsupported ? (
            <Link
              href="/admin/configuracion?seccion=notificaciones-push"
              className="inline-flex min-h-11 items-center justify-center rounded-[18px] bg-brand-600 px-4 py-3 text-sm font-semibold text-white"
            >
              Ver configuración
            </Link>
          ) : (
            <button
              type="button"
              disabled={push.actionLoading}
              onClick={() => void push.activate()}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[18px] bg-brand-600 px-4 py-3 text-sm font-semibold text-white disabled:bg-brand-200"
            >
              {repair ? <RefreshCcw className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
              {push.actionLoading
                ? "Activando..."
                : repair
                  ? "Reactivar notificaciones"
                  : "Activar notificaciones"}
            </button>
          )}
          <button
            type="button"
            onClick={dismiss}
            className="inline-flex min-h-11 items-center justify-center rounded-[18px] border border-brand-200 bg-white px-4 py-3 text-sm font-semibold text-brand-900"
          >
            Ahora no
          </button>
        </div>
      </div>
    </div>
  );
}
