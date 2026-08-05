/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Resumenes (superior y final) - carga masiva de imagenes (Fase 7.3)
 * Descripcion: Funciones puras de conteo sobre BulkImageRow[]/ejecucion de
 * cola. Separadas del componente de UI para poder probarlas sin renderizar
 * nada (este proyecto no usa jsdom/RTL).
 */

import type { BulkImageRow, BulkQueueItemState } from "@/lib/product-image-bulk-types";

/** Resumen superior del Preview (seccion 11): se recalcula en vivo mientras el administrador ajusta filas, antes de subir nada. */
export type BulkImagePreviewSummary = {
  totalFiles: number;
  automaticMatches: number;
  manualMatches: number;
  ambiguous: number;
  unmatched: number;
  duplicates: number;
  alreadyHasImage: number;
  excluded: number;
  readyToUpload: number;
};

const AUTOMATIC_MATCH_STATUSES: ReadonlySet<BulkImageRow["status"]> = new Set([
  "MATCHED_BY_SKU",
  "MATCHED_BY_EXACT_NAME",
  "MATCHED_BY_BRAND_NAME",
  "MATCHED_BY_FULL_IDENTITY"
]);

export function computeBulkImagePreviewSummary(rows: readonly BulkImageRow[]): BulkImagePreviewSummary {
  return {
    totalFiles: rows.length,
    automaticMatches: rows.filter((row) => AUTOMATIC_MATCH_STATUSES.has(row.status)).length,
    manualMatches: rows.filter((row) => row.status === "MANUALLY_MATCHED").length,
    ambiguous: rows.filter((row) => row.status === "AMBIGUOUS").length,
    unmatched: rows.filter((row) => row.status === "UNMATCHED").length,
    duplicates: rows.filter(
      (row) => row.status === "DUPLICATE_FILENAME" || row.status === "DUPLICATE_PRODUCT_ASSIGNMENT"
    ).length,
    alreadyHasImage: rows.filter((row) => row.status === "ALREADY_HAS_IMAGE").length,
    excluded: rows.filter((row) => row.status === "EXCLUDED").length,
    readyToUpload: rows.filter((row) => row.ready).length
  };
}

/** Resumen final (seccion 15): combina el resultado de la cola con filas que nunca llegaron a encolarse. */
export type BulkImageFinalSummary = {
  totalProcessed: number;
  uploaded: number;
  replaced: number;
  skipped: number;
  failed: number;
  cancelled: number;
  notStarted: number;
  productsUpdated: number;
};

export function computeBulkImageFinalSummary(
  rows: readonly BulkImageRow[],
  executionStates: Readonly<Record<string, { state: BulkQueueItemState; error?: string }>>
): BulkImageFinalSummary {
  const updatedProductIds = new Set<string>();
  let uploaded = 0;
  let replaced = 0;
  let failed = 0;
  let cancelled = 0;
  let notStarted = 0;
  const skipped = rows.filter((row) => row.action === "SKIP").length;

  for (const row of rows) {
    const execution = executionStates[row.fileId];

    if (!row.ready) {
      // Nunca se encolo: ni exitoso, ni fallido, ni cancelado -- simplemente
      // no era una fila lista (sin match, ambigua, excluida, invalida,
      // duplicada, u omitida por tener imagen sin reemplazo autorizado).
      if (row.action !== "SKIP") notStarted += 1;
      continue;
    }

    if (execution?.state === "SUCCESS") {
      if (row.action === "REPLACE") replaced += 1;
      else uploaded += 1;
      if (row.matchedProductId) updatedProductIds.add(row.matchedProductId);
    } else if (execution?.state === "FAILED") {
      failed += 1;
    } else if (execution?.state === "SKIPPED") {
      cancelled += 1;
    } else {
      notStarted += 1;
    }
  }

  return {
    totalProcessed: rows.length,
    uploaded,
    replaced,
    skipped,
    failed,
    cancelled,
    notStarted,
    productsUpdated: updatedProductIds.size
  };
}

/** Resumen JSON exportable localmente (seccion 15): nunca incluye tokens, URLs firmadas, binarios ni datos personales. */
export function buildBulkImageExportSummary(
  rows: readonly BulkImageRow[],
  executionStates: Readonly<Record<string, { state: BulkQueueItemState; error?: string }>>
) {
  return {
    generatedAt: new Date().toISOString(),
    summary: computeBulkImageFinalSummary(rows, executionStates),
    rows: rows.map((row) => ({
      fileName: row.fileName,
      status: row.status,
      action: row.action,
      matchedProductId: row.matchedProductId,
      executionState: executionStates[row.fileId]?.state ?? null,
      error: executionStates[row.fileId]?.error ?? null
    }))
  };
}
