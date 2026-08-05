"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Search, Trash2, Undo2, X } from "lucide-react";
import { ProductImage } from "@/components/ProductImage";
import type { BulkImageCandidateProduct } from "@/lib/product-image-bulk-types";
import type { BulkImageRow, BulkQueueItemState } from "@/lib/product-image-bulk-types";

const STATUS_LABELS: Record<BulkImageRow["status"], string> = {
  MATCHED_BY_SKU: "Coincidencia por SKU",
  MATCHED_BY_EXACT_NAME: "Coincidencia por nombre",
  MATCHED_BY_BRAND_NAME: "Coincidencia por marca y nombre",
  MATCHED_BY_FULL_IDENTITY: "Coincidencia por marca, nombre y contenido",
  AMBIGUOUS: "Ambiguo: requiere asociación manual",
  UNMATCHED: "Sin coincidencia",
  DUPLICATE_FILENAME: "Nombre de archivo duplicado",
  DUPLICATE_PRODUCT_ASSIGNMENT: "Ya asociado a otro archivo",
  INVALID_FILE: "Archivo inválido",
  ALREADY_HAS_IMAGE: "El producto ya tiene imagen",
  MANUALLY_MATCHED: "Asociación manual",
  EXCLUDED: "Excluido del lote"
};

const ACTION_LABELS: Record<BulkImageRow["action"], string> = {
  UPLOAD: "Se subirá",
  REPLACE: "Reemplazará la imagen actual",
  SKIP: "Se omitirá",
  EXCLUDE: "Excluido"
};

const EXECUTION_LABELS: Record<BulkQueueItemState, string> = {
  PENDING: "En espera",
  UPLOADING: "Subiendo…",
  SUCCESS: "Subida exitosa",
  FAILED: "Falló",
  SKIPPED: "Cancelado"
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type BulkImagePreviewProps = {
  rows: BulkImageRow[];
  previewUrls: Record<string, string>;
  products: BulkImageCandidateProduct[];
  disabled: boolean;
  globalReplaceAuthorized: boolean;
  onExclude: (fileId: string, excluded: boolean) => void;
  onManualMatch: (fileId: string, productId: string | null) => void;
  onReplaceRequestChange: (fileId: string, requested: boolean) => void;
  /** Quita el archivo por completo de la seleccion (distinto de excluir: libera su object URL, ver seccion 16). */
  onRemove: (fileId: string) => void;
  executionStates: Record<string, { state: BulkQueueItemState; error?: string }>;
  showOnlyFailed?: boolean;
};

export function BulkImagePreview({
  rows,
  previewUrls,
  products,
  disabled,
  globalReplaceAuthorized,
  onExclude,
  onManualMatch,
  onReplaceRequestChange,
  onRemove,
  executionStates,
  showOnlyFailed = false
}: BulkImagePreviewProps) {
  const productsById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);

  const visibleRows = showOnlyFailed
    ? rows.filter((row) => executionStates[row.fileId]?.state === "FAILED")
    : rows;

  if (visibleRows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[#e4e7ec] bg-white px-4 py-6 text-center text-sm text-[#667085]">
        {showOnlyFailed ? "No hay filas fallidas." : "No hay archivos seleccionados."}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {visibleRows.map((row) => {
        const matchedProduct = row.matchedProductId ? productsById.get(row.matchedProductId) : undefined;
        const execution = executionStates[row.fileId];
        const needsManualPicker = row.status === "AMBIGUOUS" || row.status === "UNMATCHED";
        const canOfferReplace = row.status === "ALREADY_HAS_IMAGE";

        return (
          <li
            key={row.fileId}
            className={`flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm sm:flex-row sm:items-start ${
              row.blocking ? "border-[#f3c6c0]" : "border-[#e4e7ec]"
            }`}
          >
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-[#f7f8fa]">
              {previewUrls[row.fileId] ? (
                // eslint-disable-next-line @next/next/no-img-element -- miniatura local (object URL), nunca pasa por next/image ni por Storage.
                <img src={previewUrls[row.fileId]} alt={row.fileName} className="h-full w-full object-cover" />
              ) : null}
            </div>

            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#111318]">{row.fileName}</p>
                  <p className="text-xs text-[#98a2b3]">
                    {formatFileSize(row.fileSize)} · {row.mimeType || "formato desconocido"}
                  </p>
                </div>
                {!disabled ? (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onExclude(row.fileId, row.status !== "EXCLUDED")}
                      className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-[#e4e7ec] px-2.5 py-1.5 text-xs font-semibold text-[#344054] hover:bg-[#f7f8fa]"
                    >
                      {row.status === "EXCLUDED" ? (
                        <>
                          <Undo2 className="h-3.5 w-3.5" />
                          Incluir
                        </>
                      ) : (
                        <>
                          <X className="h-3.5 w-3.5" />
                          Excluir
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove(row.fileId)}
                      title="Quitar de la selección"
                      aria-label={`Quitar ${row.fileName} de la selección`}
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#e4e7ec] text-[#98a2b3] hover:bg-[#f7f8fa] hover:text-[#8a2c22]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span
                  className={`rounded-full px-2.5 py-1 font-semibold ${
                    row.blocking
                      ? "bg-[#fdf1ef] text-[#8a2c22]"
                      : row.ready
                        ? "bg-[#eefbf1] text-[#1f6d33]"
                        : "bg-[#f2f4f7] text-[#475467]"
                  }`}
                >
                  {STATUS_LABELS[row.status]}
                </span>
                <span className="rounded-full bg-[#f7f8fa] px-2.5 py-1 font-semibold text-[#344054]">
                  {ACTION_LABELS[row.action]}
                </span>
                {execution ? (
                  <span className="rounded-full bg-[#eeebff] px-2.5 py-1 font-semibold text-[#5434e6]">
                    {EXECUTION_LABELS[execution.state]}
                  </span>
                ) : null}
              </div>

              {matchedProduct ? (
                <div className="flex flex-wrap items-center gap-3 rounded-xl bg-[#f7f8fa] px-3 py-2 text-xs text-[#344054]">
                  {matchedProduct.imageUrl ? (
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg">
                      <ProductImage
                        src={matchedProduct.imageUrl}
                        alt={matchedProduct.nombre}
                        sizes="40px"
                        compact
                        className="object-cover"
                      />
                    </div>
                  ) : null}
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[#111318]">{matchedProduct.nombre}</p>
                    <p className="truncate text-[#667085]">
                      {[matchedProduct.sku, matchedProduct.marca, matchedProduct.contenido].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </div>
              ) : null}

              {canOfferReplace && !disabled ? (
                <label className="flex items-center gap-2 text-xs font-semibold text-[#344054]">
                  <input
                    type="checkbox"
                    checked={Boolean(row.action === "REPLACE")}
                    disabled={!globalReplaceAuthorized && row.action !== "REPLACE"}
                    onChange={(event) => onReplaceRequestChange(row.fileId, event.target.checked)}
                  />
                  Reemplazar imagen existente
                </label>
              ) : null}

              {row.warnings.length > 0 ? (
                <div className="flex flex-col gap-1">
                  {row.warnings.map((warning, index) => (
                    <p key={index} className="flex items-start gap-1.5 text-xs text-[#8a5a00]">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {warning}
                    </p>
                  ))}
                </div>
              ) : null}

              {execution?.state === "FAILED" && execution.error ? (
                <p className="flex items-start gap-1.5 text-xs text-[#8a2c22]">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {execution.error}
                </p>
              ) : null}

              {needsManualPicker && !disabled ? (
                <ManualMatchPicker
                  products={products}
                  candidateProductIds={row.candidateProductIds}
                  onSelect={(productId) => onManualMatch(row.fileId, productId)}
                />
              ) : null}

              {row.status === "MANUALLY_MATCHED" && !disabled ? (
                <button
                  type="button"
                  onClick={() => onManualMatch(row.fileId, null)}
                  className="inline-flex min-h-9 items-center gap-1 self-start rounded-lg border border-[#e4e7ec] px-2.5 py-1.5 text-xs font-semibold text-[#344054] hover:bg-[#f7f8fa]"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  Deshacer asociación manual
                </button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function ManualMatchPicker({
  products,
  candidateProductIds,
  onSelect
}: {
  products: BulkImageCandidateProduct[];
  candidateProductIds: string[];
  onSelect: (productId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    const pool = candidateProductIds.length > 0
      ? products.filter((product) => candidateProductIds.includes(product.id))
      : products;
    if (!trimmed) return pool.slice(0, 20);
    return pool
      .filter((product) =>
        [product.sku, product.marca, product.nombre, product.contenido]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(trimmed)
      )
      .slice(0, 20);
  }, [products, candidateProductIds, query]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-9 items-center gap-1.5 self-start rounded-lg bg-[#5434e6] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#4327c4]"
      >
        <Search className="h-3.5 w-3.5" />
        Asociar manualmente
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-[#e4e7ec] bg-[#f7f8fa] p-3">
      <div className="flex items-center gap-2">
        <input
          type="search"
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por SKU, marca, nombre o contenido"
          aria-label="Buscar producto para asociar"
          className="w-full rounded-lg border border-[#e4e7ec] bg-white px-2.5 py-1.5 text-xs"
        />
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Cerrar búsqueda"
          className="shrink-0 rounded-lg p-1.5 text-[#98a2b3] hover:bg-white"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <li className="px-2 py-1.5 text-xs text-[#98a2b3]">Sin resultados.</li>
        ) : (
          filtered.map((product) => (
            <li key={product.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(product.id);
                  setOpen(false);
                  setQuery("");
                }}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs hover:bg-white"
              >
                <span className="min-w-0 truncate font-semibold text-[#111318]">{product.nombre}</span>
                <span className="shrink-0 text-[#667085]">
                  {[product.sku, product.marca, product.contenido].filter(Boolean).join(" · ")}
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

export { formatFileSize };
