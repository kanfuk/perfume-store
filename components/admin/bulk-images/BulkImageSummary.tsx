"use client";

import type { BulkImageRow } from "@/lib/product-image-bulk-types";
import { computeBulkImagePreviewSummary } from "@/lib/product-image-bulk-summary";

function Tile({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "good" | "warn" | "bad" }) {
  const toneClasses: Record<typeof tone, string> = {
    good: "bg-[#eefbf1] text-[#1f6d33]",
    bad: "bg-[#fdf1ef] text-[#8a2c22]",
    warn: "bg-[#fff8ec] text-[#8a5a00]",
    neutral: "bg-[#F7F1E8] text-[#4D453D]"
  };
  return (
    <div className={`rounded-xl px-3 py-2.5 ${toneClasses[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-0.5 text-xl font-bold">{value}</p>
    </div>
  );
}

/** Resumen superior del Preview (seccion 11): se recalcula en vivo mientras el administrador ajusta filas. */
export function BulkImagePreviewSummaryBar({ rows }: { rows: BulkImageRow[] }) {
  const summary = computeBulkImagePreviewSummary(rows);

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      <Tile label="Seleccionados" value={summary.totalFiles} />
      <Tile label="Matched" value={summary.automaticMatches + summary.manualMatches} tone="good" />
      <Tile label="Unmatched" value={summary.unmatched} tone="warn" />
      <Tile label="Ambiguous" value={summary.ambiguous} tone="bad" />
      <Tile label="Duplicated" value={summary.duplicates} tone="bad" />
      <Tile label="Con imagen previa" value={summary.alreadyHasImage} tone="warn" />
      <Tile label="Excluidos" value={summary.excluded} />
      <Tile label="Listos para cargar" value={summary.readyToUpload} tone="good" />
    </div>
  );
}

export type BulkImageFinalSummaryData = {
  totalProcessed: number;
  uploaded: number;
  replaced: number;
  skipped: number;
  failed: number;
  cancelled: number;
  notStarted: number;
  productsUpdated: number;
};

type BulkImageFinalSummaryPanelProps = {
  summary: BulkImageFinalSummaryData;
  onShowOnlyFailedChange: (value: boolean) => void;
  showOnlyFailed: boolean;
  onRetryFailed: () => void;
  onStartNewBatch: () => void;
  onExportJson: () => void;
  retrying: boolean;
};

/** Resumen final (seccion 15), mostrado despues de que la cola termina o se cancela. */
export function BulkImageFinalSummaryPanel({
  summary,
  onShowOnlyFailedChange,
  showOnlyFailed,
  onRetryFailed,
  onStartNewBatch,
  onExportJson,
  retrying
}: BulkImageFinalSummaryPanelProps) {
  return (
    <div className="space-y-4 rounded-2xl border border-[#DDD0C1] bg-white p-5">
      <h3 className="text-lg font-bold text-[#191714]">Resumen final</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Procesados" value={summary.totalProcessed} />
        <Tile label="Subidas exitosas" value={summary.uploaded} tone="good" />
        <Tile label="Reemplazos exitosos" value={summary.replaced} tone="good" />
        <Tile label="Omitidos" value={summary.skipped} />
        <Tile label="Failed upload" value={summary.failed} tone="bad" />
        <Tile label="Cancelados" value={summary.cancelled} tone="warn" />
        <Tile label="No iniciados" value={summary.notStarted} tone="warn" />
        <Tile label="Productos actualizados" value={summary.productsUpdated} tone="good" />
      </div>

      <div className="flex flex-wrap gap-2">
        <label className="flex items-center gap-2 text-sm font-semibold text-[#4D453D]">
          <input
            type="checkbox"
            checked={showOnlyFailed}
            onChange={(event) => onShowOnlyFailedChange(event.target.checked)}
          />
          Ver solo fallidos
        </label>
        <button
          type="button"
          disabled={summary.failed === 0 || retrying}
          onClick={onRetryFailed}
          className="inline-flex min-h-10 items-center rounded-xl bg-[#8A6036] px-3.5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {retrying ? "Reintentando…" : "Reintentar fallidos"}
        </button>
        <button
          type="button"
          onClick={onStartNewBatch}
          className="inline-flex min-h-10 items-center rounded-xl border border-[#DDD0C1] px-3.5 py-2 text-sm font-semibold text-[#4D453D]"
        >
          Iniciar un lote nuevo
        </button>
        <button
          type="button"
          onClick={onExportJson}
          className="inline-flex min-h-10 items-center rounded-xl border border-[#DDD0C1] px-3.5 py-2 text-sm font-semibold text-[#4D453D]"
        >
          Exportar resumen JSON
        </button>
      </div>
    </div>
  );
}
