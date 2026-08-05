import { describe, expect, it } from "vitest";
import {
  buildBulkImageExportSummary,
  computeBulkImageFinalSummary,
  computeBulkImagePreviewSummary
} from "@/lib/product-image-bulk-summary";
import type { BulkImageRow, BulkQueueItemState } from "@/lib/product-image-bulk-types";

function row(overrides: Partial<BulkImageRow> & { fileId: string }): BulkImageRow {
  return {
    fileName: `${overrides.fileId}.jpg`,
    fileSize: 100,
    mimeType: "image/jpeg",
    status: "UNMATCHED",
    matchedProductId: null,
    candidateProductIds: [],
    action: "EXCLUDE",
    ready: false,
    blocking: false,
    warnings: [],
    expectedImageStoragePath: null,
    ...overrides
  };
}

describe("computeBulkImagePreviewSummary", () => {
  it("cuenta cada categoria correctamente", () => {
    const rows: BulkImageRow[] = [
      row({ fileId: "a", status: "MATCHED_BY_SKU", action: "UPLOAD", ready: true }),
      row({ fileId: "b", status: "MANUALLY_MATCHED", action: "UPLOAD", ready: true }),
      row({ fileId: "c", status: "AMBIGUOUS", blocking: true }),
      row({ fileId: "d", status: "UNMATCHED" }),
      row({ fileId: "e", status: "DUPLICATE_FILENAME", blocking: true }),
      row({ fileId: "f", status: "DUPLICATE_PRODUCT_ASSIGNMENT", blocking: true }),
      row({ fileId: "g", status: "ALREADY_HAS_IMAGE", action: "SKIP" }),
      row({ fileId: "h", status: "EXCLUDED" })
    ];

    const summary = computeBulkImagePreviewSummary(rows);
    expect(summary).toEqual({
      totalFiles: 8,
      automaticMatches: 1,
      manualMatches: 1,
      ambiguous: 1,
      unmatched: 1,
      duplicates: 2,
      alreadyHasImage: 1,
      excluded: 1,
      readyToUpload: 2
    });
  });
});

describe("computeBulkImageFinalSummary", () => {
  it("distingue exitos, reemplazos, omitidos, fallidos, cancelados y no iniciados", () => {
    const rows: BulkImageRow[] = [
      row({ fileId: "a", status: "MATCHED_BY_SKU", matchedProductId: "p1", action: "UPLOAD", ready: true }),
      row({ fileId: "b", status: "ALREADY_HAS_IMAGE", matchedProductId: "p2", action: "REPLACE", ready: true }),
      row({ fileId: "c", status: "ALREADY_HAS_IMAGE", matchedProductId: "p3", action: "SKIP", ready: false }),
      row({ fileId: "d", status: "MATCHED_BY_SKU", matchedProductId: "p4", action: "UPLOAD", ready: true }),
      row({ fileId: "e", status: "MATCHED_BY_SKU", matchedProductId: "p5", action: "UPLOAD", ready: true }),
      row({ fileId: "f", status: "UNMATCHED", action: "EXCLUDE", ready: false })
    ];

    const executionStates: Record<string, { state: BulkQueueItemState; error?: string }> = {
      a: { state: "SUCCESS" },
      b: { state: "SUCCESS" },
      d: { state: "FAILED", error: "Error de red." },
      e: { state: "SKIPPED" }
    };

    const summary = computeBulkImageFinalSummary(rows, executionStates);
    expect(summary).toEqual({
      totalProcessed: 6,
      uploaded: 1,
      replaced: 1,
      skipped: 1,
      failed: 1,
      cancelled: 1,
      notStarted: 1,
      productsUpdated: 2
    });
  });

  it("no cuenta productos actualizados para fallos ni cancelados", () => {
    const rows: BulkImageRow[] = [
      row({ fileId: "a", status: "MATCHED_BY_SKU", matchedProductId: "p1", action: "UPLOAD", ready: true })
    ];
    const executionStates: Record<string, { state: BulkQueueItemState }> = { a: { state: "FAILED" } };
    const summary = computeBulkImageFinalSummary(rows, executionStates);
    expect(summary.productsUpdated).toBe(0);
    expect(summary.failed).toBe(1);
  });
});

describe("buildBulkImageExportSummary", () => {
  it("nunca incluye tokens, URLs firmadas ni contenido binario", () => {
    const rows: BulkImageRow[] = [
      row({ fileId: "a", status: "MATCHED_BY_SKU", matchedProductId: "p1", action: "UPLOAD", ready: true })
    ];
    const executionStates: Record<string, { state: BulkQueueItemState }> = { a: { state: "SUCCESS" } };
    const exportSummary = buildBulkImageExportSummary(rows, executionStates);

    const serialized = JSON.stringify(exportSummary);
    expect(serialized).not.toMatch(/token/i);
    expect(serialized).not.toMatch(/signed/i);
    expect(serialized).not.toMatch(/supabase\.co\/storage/i);
    expect(exportSummary.rows[0]).toEqual({
      fileName: "a.jpg",
      status: "MATCHED_BY_SKU",
      action: "UPLOAD",
      matchedProductId: "p1",
      executionState: "SUCCESS",
      error: null
    });
  });
});
