/**
 * Proyecto: Perfume Store
 * Modulo: Panel de Cierres Semanales (Fase 7.6A)
 * Descripcion: UI administrativa autocontenida para previsualizar, cerrar,
 * listar, ver el detalle, reabrir (con motivo obligatorio) y exportar CSV
 * de cierres semanales. Se integra dentro de /admin/reportes como una
 * pestana mas (no es un modulo aislado). Toda la logica de negocio vive en
 * services/cierreSemanalService.ts -- este componente solo llama a las
 * rutas /api/admin/weekly-closures/* y muestra el resultado.
 * Seguridad: No incluir claves ni datos sensibles en este archivo.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, History, Lock, LockOpen, RotateCcw } from "lucide-react";
import {
  EmptyState,
  MiniMetric,
  ReportDateField,
  SectionIntro,
  StatusBadge
} from "@/components/admin/dashboard/DashboardPresentation";
import { formatChileDateOnly } from "@/lib/date";
import { formatCurrency } from "@/lib/format";

const MOTIVO_REAPERTURA_MIN_LENGTH = 5;
const MOTIVO_REAPERTURA_MAX_LENGTH = 500;

type WeeklyClosureMetrics = {
  ordersCount: number;
  cancelledOrdersCount: number;
  pendingOrdersCount: number;
  deliveredOrdersCount: number;
  directSalesCount: number;
  grossSales: number;
  incomeAmount: number;
  costAmount: number;
  profitAmount: number;
  outstandingAmount: number;
};

type WeeklyClosureView = {
  id: string;
  periodStart: string;
  periodEndExclusive: string;
  version: number;
  status: "CLOSED" | "REOPENED";
  metrics: WeeklyClosureMetrics;
  closedAt: string;
  closedByEmail: string | null;
  closedByNombre: string | null;
  reopenedAt: string | null;
  reopenedByEmail: string | null;
  reopenedByNombre: string | null;
  hasReopenReason: boolean;
};

type WeeklyClosureDetailView = WeeklyClosureView & {
  snapshot: Record<string, unknown>;
  reopenReason: string | null;
};

type WeeklyClosurePreview = {
  periodStart: string;
  periodEndExclusive: string;
  metrics: WeeklyClosureMetrics;
};

function getDefaultMondayInputValue(): string {
  const now = new Date();
  const diffToMonday = (now.getDay() + 6) % 7;
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() - diffToMonday);
  const previousMonday = new Date(thisMonday);
  previousMonday.setDate(thisMonday.getDate() - 7);

  const year = previousMonday.getFullYear();
  const month = String(previousMonday.getMonth() + 1).padStart(2, "0");
  const day = String(previousMonday.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatPeriodRange(periodStart: string, periodEndExclusive: string) {
  const lastDay = new Date(new Date(periodEndExclusive).getTime() - 24 * 60 * 60 * 1000);
  return `${formatChileDateOnly(periodStart)} – ${formatChileDateOnly(lastDay.toISOString())}`;
}

async function parseJsonResponse(response: Response) {
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body?.error || "No fue posible completar la solicitud.");
  }

  return body;
}

function MetricsGrid({ metrics }: { metrics: WeeklyClosureMetrics }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-5">
      <MiniMetric label="Pedidos" value={String(metrics.ordersCount)} />
      <MiniMetric label="Pendientes" value={String(metrics.pendingOrdersCount)} />
      <MiniMetric label="Entregados" value={String(metrics.deliveredOrdersCount)} />
      <MiniMetric label="Cancelados" value={String(metrics.cancelledOrdersCount)} />
      <MiniMetric label="Ventas directas" value={String(metrics.directSalesCount)} />
      <MiniMetric label="Ventas" value={formatCurrency(metrics.grossSales)} />
      <MiniMetric label="Ingresos (caja)" value={formatCurrency(metrics.incomeAmount)} />
      <MiniMetric label="Costos" value={formatCurrency(metrics.costAmount)} />
      <MiniMetric label="Utilidad" value={formatCurrency(metrics.profitAmount)} />
      <MiniMetric label="Fiado pendiente" value={formatCurrency(metrics.outstandingAmount)} />
    </div>
  );
}

export function WeeklyClosuresPanel() {
  const [closures, setClosures] = useState<WeeklyClosureView[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");

  const [mondayDateInput, setMondayDateInput] = useState(getDefaultMondayInputValue);
  const [preview, setPreview] = useState<WeeklyClosurePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [closing, setClosing] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const [detail, setDetail] = useState<WeeklyClosureDetailView | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const [reopenTarget, setReopenTarget] = useState<WeeklyClosureView | null>(null);
  const [reopenReason, setReopenReason] = useState("");
  const [reopenSubmitting, setReopenSubmitting] = useState(false);
  const [reopenError, setReopenError] = useState("");

  const loadClosures = useCallback(async () => {
    setListLoading(true);
    setListError("");

    try {
      const response = await fetch("/api/admin/weekly-closures?limit=50", { cache: "no-store" });
      const body = (await parseJsonResponse(response)) as { items: WeeklyClosureView[] };
      setClosures(body.items);
    } catch (error) {
      setListError(error instanceof Error ? error.message : "No fue posible cargar el historial.");
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial deliberada, mismo patron que el resto del proyecto
    void loadClosures();
  }, [loadClosures]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- limpia la vista previa anterior al cambiar de periodo
    setPreview(null);
    setPreviewError("");
  }, [mondayDateInput]);

  const handlePreview = useCallback(async () => {
    setPreviewLoading(true);
    setPreviewError("");
    setSuccessMessage("");

    try {
      const response = await fetch("/api/admin/weekly-closures/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mondayDateInput })
      });
      const body = (await parseJsonResponse(response)) as { preview: WeeklyClosurePreview };
      setPreview(body.preview);
    } catch (error) {
      setPreview(null);
      setPreviewError(error instanceof Error ? error.message : "No fue posible calcular la vista previa.");
    } finally {
      setPreviewLoading(false);
    }
  }, [mondayDateInput]);

  const handleCerrar = useCallback(async () => {
    setClosing(true);
    setPreviewError("");

    try {
      const response = await fetch("/api/admin/weekly-closures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mondayDateInput })
      });
      await parseJsonResponse(response);
      setPreview(null);
      setSuccessMessage("Semana cerrada correctamente.");
      await loadClosures();
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : "No fue posible cerrar la semana.");
    } finally {
      setClosing(false);
    }
  }, [mondayDateInput, loadClosures]);

  const openDetail = useCallback(async (closureId: string) => {
    setDetailLoading(true);
    setDetailError("");
    setDetail(null);

    try {
      const response = await fetch(`/api/admin/weekly-closures/${closureId}`, { cache: "no-store" });
      const body = (await parseJsonResponse(response)) as { closure: WeeklyClosureDetailView };
      setDetail(body.closure);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "No fue posible cargar el detalle.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleReopenSubmit = useCallback(async () => {
    if (!reopenTarget) return;

    setReopenSubmitting(true);
    setReopenError("");

    try {
      const response = await fetch(`/api/admin/weekly-closures/${reopenTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reopen", reason: reopenReason })
      });
      await parseJsonResponse(response);
      setReopenTarget(null);
      setReopenReason("");
      setSuccessMessage("Cierre reabierto correctamente.");
      await loadClosures();
    } catch (error) {
      setReopenError(error instanceof Error ? error.message : "No fue posible reabrir el cierre.");
    } finally {
      setReopenSubmitting(false);
    }
  }, [reopenTarget, reopenReason, loadClosures]);

  const trimmedReasonLength = reopenReason.trim().length;
  const reasonTooShort = trimmedReasonLength > 0 && trimmedReasonLength < MOTIVO_REAPERTURA_MIN_LENGTH;
  const canSubmitReopen =
    trimmedReasonLength >= MOTIVO_REAPERTURA_MIN_LENGTH && reopenReason.length <= MOTIVO_REAPERTURA_MAX_LENGTH;

  return (
    <div className="space-y-5">
      <SectionIntro
        title="Cierres semanales"
        subtitle="Fotografia inmutable de cada semana, con historial y reapertura auditada."
        icon={CalendarClock}
        helper="Semana calendario lunes a domingo, hora de Chile."
      />

      <section className="rounded-lg border border-brand-100 bg-white/90 p-4 shadow-soft sm:p-5">
        <h3 className="text-base font-bold text-brand-950">Cerrar semana</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <ReportDateField label="Lunes de la semana" value={mondayDateInput} onChange={setMondayDateInput} />
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => void handlePreview()}
              disabled={previewLoading}
              className="min-h-12 flex-1 rounded-[18px] border border-brand-200 bg-white px-4 text-sm font-semibold text-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {previewLoading ? "Calculando..." : "Vista previa"}
            </button>
          </div>
        </div>

        {previewError ? <p className="mt-3 text-sm font-medium text-rose-700">{previewError}</p> : null}
        {successMessage ? <p className="mt-3 text-sm font-medium text-emerald-700">{successMessage}</p> : null}

        {preview ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-brand-900/70">
              Periodo: {formatPeriodRange(preview.periodStart, preview.periodEndExclusive)}
            </p>
            <MetricsGrid metrics={preview.metrics} />
            <button
              type="button"
              onClick={() => void handleCerrar()}
              disabled={closing}
              className="min-h-12 w-full rounded-[18px] bg-brand-700 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {closing ? "Cerrando..." : "Confirmar cierre"}
            </button>
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-brand-100 bg-white/90 p-4 shadow-soft sm:p-5">
        <div className="flex items-center gap-2 text-brand-950">
          <History className="h-5 w-5" />
          <h3 className="text-base font-bold">Historial</h3>
        </div>

        <div className="mt-4 space-y-3">
          {listLoading ? <EmptyState text="Cargando historial de cierres..." /> : null}
          {!listLoading && listError ? <EmptyState text={listError} /> : null}
          {!listLoading && !listError && closures.length === 0 ? (
            <EmptyState text="Todavia no hay cierres semanales registrados." />
          ) : null}

          {closures.map((closure) => (
            <article key={closure.id} className="rounded-lg border border-brand-100 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold text-brand-950">
                    {formatPeriodRange(closure.periodStart, closure.periodEndExclusive)}
                  </div>
                  <div className="text-xs text-brand-900/60">Version {closure.version}</div>
                </div>
                <StatusBadge
                  tone={closure.status === "CLOSED" ? "pedido" : "warning"}
                  label={closure.status === "CLOSED" ? "Activo" : "Reabierto"}
                />
              </div>

              <div className="mt-3">
                <MetricsGrid metrics={closure.metrics} />
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void openDetail(closure.id)}
                  className="min-h-10 rounded-[16px] border border-brand-200 bg-white px-3 text-xs font-semibold text-brand-800"
                >
                  Ver detalle
                </button>
                <a
                  href={`/api/admin/weekly-closures/${closure.id}/export`}
                  className="inline-flex min-h-10 items-center rounded-[16px] border border-brand-200 bg-white px-3 text-xs font-semibold text-brand-800"
                >
                  Exportar CSV
                </a>
                {closure.status === "CLOSED" ? (
                  <button
                    type="button"
                    onClick={() => {
                      setReopenTarget(closure);
                      setReopenReason("");
                      setReopenError("");
                    }}
                    className="inline-flex min-h-10 items-center gap-1 rounded-[16px] border border-amber-200 bg-amber-50 px-3 text-xs font-semibold text-amber-800"
                  >
                    <LockOpen className="h-3.5 w-3.5" /> Reabrir
                  </button>
                ) : (
                  <span className="inline-flex min-h-10 items-center gap-1 px-3 text-xs font-medium text-brand-900/50">
                    <Lock className="h-3.5 w-3.5" /> Reabierto el {formatChileDateOnly(closure.reopenedAt ?? closure.closedAt)}
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      {detail || detailLoading || detailError ? (
        <div className="fixed inset-0 z-[110] bg-[#111318]/35 p-4 backdrop-blur-[2px]">
          <div className="mx-auto flex min-h-full w-full max-w-xl items-center justify-center">
            <div className="max-h-[85vh] w-full overflow-y-auto rounded-[30px] border border-brand-100 bg-white shadow-[0_30px_60px_rgba(17,19,24,0.22)]">
              <div className="border-b border-brand-100 p-5">
                <h3 className="text-lg font-bold text-brand-950">Detalle del cierre</h3>
              </div>
              <div className="space-y-3 p-5">
                {detailLoading ? <EmptyState text="Cargando detalle..." /> : null}
                {detailError ? <EmptyState text={detailError} /> : null}
                {detail ? (
                  <>
                    <p className="text-sm text-brand-900/70">
                      Periodo: {formatPeriodRange(detail.periodStart, detail.periodEndExclusive)} · Version{" "}
                      {detail.version}
                    </p>
                    <MetricsGrid metrics={detail.metrics} />
                    <div className="space-y-1 text-sm text-brand-900/70">
                      <p>
                        Cerrado el {formatChileDateOnly(detail.closedAt)}
                        {detail.closedByEmail ? ` por ${detail.closedByEmail}` : ""}
                      </p>
                      {detail.reopenedAt ? (
                        <p>
                          Reabierto el {formatChileDateOnly(detail.reopenedAt)}
                          {detail.reopenedByEmail ? ` por ${detail.reopenedByEmail}` : ""}
                        </p>
                      ) : null}
                      {detail.reopenReason ? <p>Motivo: {detail.reopenReason}</p> : null}
                    </div>
                  </>
                ) : null}
              </div>
              <div className="flex justify-end border-t border-brand-100 px-5 py-4">
                <button
                  type="button"
                  onClick={() => {
                    setDetail(null);
                    setDetailError("");
                  }}
                  className="min-h-11 rounded-[18px] border border-brand-100 bg-white px-4 text-sm font-semibold text-brand-800"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {reopenTarget ? (
        <div className="fixed inset-0 z-[110] bg-[#111318]/35 p-4 backdrop-blur-[2px]">
          <div className="mx-auto flex min-h-full w-full max-w-xl items-center justify-center">
            <div className="w-full overflow-hidden rounded-[30px] border border-amber-200 bg-white shadow-[0_30px_60px_rgba(17,19,24,0.22)]">
              <div className="border-b border-amber-100 bg-amber-50 p-5">
                <span className="inline-flex w-fit items-center gap-2 rounded-full border border-amber-200 bg-white/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-800">
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  Reabrir cierre
                </span>
                <h3 className="mt-2 text-xl font-bold text-brand-950">
                  Reabrir semana {formatPeriodRange(reopenTarget.periodStart, reopenTarget.periodEndExclusive)}
                </h3>
                <p className="mt-2 text-sm leading-6 text-brand-900/70">
                  Esta version quedara marcada como reabierta (no se borra). Podras cerrar la misma
                  semana nuevamente despues, como una version nueva.
                </p>
              </div>

              <div className="space-y-2 p-5">
                <label className="block space-y-2" htmlFor="motivo-reapertura-textarea">
                  <span className="text-sm font-medium text-brand-950">Motivo de reapertura (obligatorio)</span>
                  <textarea
                    id="motivo-reapertura-textarea"
                    autoFocus
                    value={reopenReason}
                    onChange={(event) => setReopenReason(event.target.value)}
                    maxLength={MOTIVO_REAPERTURA_MAX_LENGTH}
                    rows={4}
                    aria-invalid={reasonTooShort || undefined}
                    placeholder="Ejemplo: se detecto un pago registrado despues del cierre."
                    className="block w-full rounded-[18px] border border-brand-100 bg-white px-4 py-3 text-base text-brand-950 outline-none focus:border-brand-300"
                  />
                </label>
                <p className={`text-xs ${reasonTooShort ? "text-rose-700" : "text-brand-900/60"}`}>
                  {reasonTooShort
                    ? `Escribe al menos ${MOTIVO_REAPERTURA_MIN_LENGTH} caracteres.`
                    : `${reopenReason.length} de ${MOTIVO_REAPERTURA_MAX_LENGTH} caracteres`}
                </p>
                {reopenError ? <p className="text-sm font-medium text-rose-700">{reopenError}</p> : null}
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-brand-100 bg-white/95 px-5 py-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setReopenTarget(null)}
                  disabled={reopenSubmitting}
                  className="min-h-11 rounded-[18px] border border-brand-100 bg-white px-4 py-3 text-sm font-semibold text-brand-800 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={reopenSubmitting || !canSubmitReopen}
                  onClick={() => void handleReopenSubmit()}
                  className="min-h-11 rounded-[18px] bg-amber-600 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {reopenSubmitting ? "Reabriendo..." : "Reabrir cierre"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
