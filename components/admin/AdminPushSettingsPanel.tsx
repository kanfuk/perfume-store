"use client";

import { Bell, BellOff, RefreshCcw, Smartphone, Wrench } from "lucide-react";
import { useAdminPushSettings } from "@/hooks/useAdminPushSettings";
import {
  formatBadgePermission,
  formatShortDateTime
} from "@/components/admin/dashboard/admin-dashboard.utils";

function DiagnosticFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-[#E5D8C9] bg-[#F7F1E8] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7A6E63]">{label}</p>
      <p className="mt-2 text-sm font-semibold text-[#171613]">{value}</p>
    </div>
  );
}

export function AdminPushSettingsPanel({ pendingCount }: { pendingCount: number }) {
  const push = useAdminPushSettings(pendingCount);
  const needsRepair =
    push.pushSupported &&
    push.permission === "granted" &&
    !push.subscriptionActive;
  const canActivate =
    push.pushSupported &&
    push.permission !== "denied" &&
    !push.subscriptionActive;
  const canDeactivate =
    push.serverSubscriptionActive || push.subscriptionActive || push.badgeSetting?.badgeEnabled;
  const diagnosis = !push.pushSupported
    ? "Web Push no esta disponible en este navegador o dispositivo."
    : push.permission === "denied"
      ? "Notificaciones bloqueadas: habilitalas desde el navegador o sistema antes de reintentar."
      : needsRepair
        ? "El permiso esta concedido, pero falta una suscripcion valida. Usa Reparar suscripcion."
        : push.subscriptionActive
          ? "Push esta activo y la suscripcion local coincide con la registrada para este dispositivo."
          : "Push esta pendiente de activacion mediante una accion del usuario.";

  return (
    <section className="rounded-[24px] border border-[#DDD0C1] bg-white p-5 shadow-soft sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[#8A6036]">
            <Bell className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-[0.14em]">Dispositivo actual</span>
          </div>
          <h2 className="mt-2 text-xl font-bold">Notificaciones push</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6B6258]">
            Administra los avisos de pedidos y el contador del icono sin afectar el flujo de creacion de pedidos.
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-2 text-xs font-semibold ${
            push.subscriptionActive
              ? "bg-emerald-100 text-emerald-800"
              : "bg-amber-100 text-amber-900"
          }`}
        >
          {push.loaded ? (push.subscriptionActive ? "Push activo" : "Requiere atención") : "Comprobando…"}
        </span>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <DiagnosticFact
          label="Compatibilidad Push"
          value={push.pushSupported ? "Compatible" : "No compatible"}
        />
        <DiagnosticFact label="Permiso" value={formatBadgePermission(push.permission)} />
        <DiagnosticFact
          label="Suscripción"
          value={push.subscriptionActive ? "Válida y activa" : "Ausente o requiere reparación"}
        />
        <DiagnosticFact
          label="Badge"
          value={
            !push.badgeSupported
              ? "No compatible"
              : push.badgeSetting?.badgeEnabled
                ? "Activo"
                : "Desactivado"
          }
        />
        <DiagnosticFact label="Contador actual" value={String(pendingCount)} />
        <DiagnosticFact
          label="Modo de uso"
          value={push.isInstalledPwa ? "App instalada" : "Navegador / no instalada"}
        />
      </div>

      <div className="mt-5 rounded-[18px] border border-[#DDD0C1] bg-[#FAF7F2] p-4">
        <div className="flex items-start gap-3">
          <Wrench className="mt-0.5 h-5 w-5 shrink-0 text-[#8A6036]" />
          <div>
            <h3 className="text-sm font-bold text-[#171613]">Diagnóstico</h3>
            <p className="mt-1 text-sm leading-6 text-[#6B6258]">{diagnosis}</p>
            <p className="mt-1 text-xs text-[#7A6E63]">
              Última sincronización:{" "}
              {push.badgeSetting?.lastSyncAt
                ? formatShortDateTime(push.badgeSetting.lastSyncAt)
                : "Sin sincronización registrada"}
            </p>
          </div>
        </div>
      </div>

      {push.permission === "denied" ? (
        <div className="mt-4 rounded-[18px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <div className="flex items-start gap-3">
            <BellOff className="mt-0.5 h-5 w-5 shrink-0" />
            <p>
              <strong>Notificaciones bloqueadas.</strong> Habilitalas en los ajustes del sitio,
              navegador o sistema. Smellme no volvera a solicitar el permiso mientras siga denegado.
            </p>
          </div>
        </div>
      ) : null}

      {push.error ? (
        <div className="mt-4 rounded-[18px] border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {push.error}
        </div>
      ) : null}
      {push.success ? (
        <div className="mt-4 rounded-[18px] border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {push.success}
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        {canActivate ? (
          <button
            type="button"
            disabled={push.actionLoading || !push.deviceId}
            onClick={() => void push.activate()}
            className="inline-flex min-h-11 items-center gap-2 rounded-[18px] bg-[#171613] px-4 py-3 text-sm font-semibold text-white disabled:bg-[#B8B1A9]"
          >
            {needsRepair ? <RefreshCcw className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
            {push.actionLoading
              ? "Activando..."
              : needsRepair
                ? "Reparar suscripción"
                : "Activar notificaciones"}
          </button>
        ) : null}
        {push.badgeSupported && push.badgeSetting?.badgeEnabled ? (
          <button
            type="button"
            disabled={push.actionLoading}
            onClick={() => void push.testBadge()}
            className="inline-flex min-h-11 items-center gap-2 rounded-[18px] border border-[#DDD0C1] px-4 py-3 text-sm font-semibold text-[#4D453D] disabled:opacity-50"
          >
            <Smartphone className="h-4 w-4" /> Probar badge
          </button>
        ) : null}
        {push.subscriptionActive ? (
          <button
            type="button"
            disabled={push.actionLoading}
            onClick={() => void push.testPush()}
            className="inline-flex min-h-11 items-center gap-2 rounded-[18px] border border-[#DDD0C1] px-4 py-3 text-sm font-semibold text-[#4D453D] disabled:opacity-50"
          >
            <Bell className="h-4 w-4" /> Probar notificación
          </button>
        ) : null}
        {canDeactivate ? (
          <button
            type="button"
            disabled={push.actionLoading}
            onClick={() => void push.deactivate()}
            className="inline-flex min-h-11 items-center gap-2 rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800 disabled:opacity-50"
          >
            <BellOff className="h-4 w-4" /> Desactivar en este dispositivo
          </button>
        ) : null}
        <button
          type="button"
          disabled={push.actionLoading}
          onClick={() => void push.reload()}
          className="inline-flex min-h-11 items-center gap-2 rounded-[18px] border border-[#DDD0C1] px-4 py-3 text-sm font-semibold text-[#4D453D] disabled:opacity-50"
        >
          <RefreshCcw className="h-4 w-4" /> Volver a comprobar
        </button>
      </div>
    </section>
  );
}
