"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ImagePlus, PackagePlus, Trash2, UploadCloud, X } from "lucide-react";
import { useAppFeedback } from "@/hooks/useAppFeedback";
import { BULK_PRODUCT_IMAGE_MAX_FILES } from "@/lib/constants";
import {
  canConfirmBulkUpload,
  checkBulkFileCountLimit,
  matchBulkProductImages
} from "@/lib/product-image-bulk-matching";
import { computeBulkImageFinalSummary, buildBulkImageExportSummary } from "@/lib/product-image-bulk-summary";
import { runBulkImageUploadQueue } from "@/lib/product-image-bulk-queue";
import type {
  BulkImageCandidateProduct,
  BulkImageDecision,
  BulkImageInputFile,
  BulkImageRow,
  BulkQueueItemState,
  BulkQueueJob
} from "@/lib/product-image-bulk-types";
import { BulkImageDropzone } from "@/components/admin/bulk-images/BulkImageDropzone";
import { BulkImagePreview } from "@/components/admin/bulk-images/BulkImagePreview";
import { BulkImagePreviewSummaryBar, BulkImageFinalSummaryPanel } from "@/components/admin/bulk-images/BulkImageSummary";
import type { AdminProductRecord } from "@/lib/types";

type Stage = "select" | "uploading" | "summary";

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Ocurrió un error.");
  return data;
}

async function computeContentHash(file: File): Promise<string | undefined> {
  try {
    const buffer = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    // El hash es solo una ayuda para detectar duplicados binarios -- si el
    // navegador no lo soporta, el resto del flujo sigue funcionando igual.
    return undefined;
  }
}

function toCandidateProduct(product: AdminProductRecord): BulkImageCandidateProduct {
  return {
    id: product.id,
    sku: product.sku,
    nombre: product.nombre,
    marca: product.marca,
    contenido: product.contenido,
    imageUrl: product.imageUrl,
    imageStoragePath: product.imageStoragePath
  };
}

export function BulkProductImagePanel() {
  const feedback = useAppFeedback();

  const [products, setProducts] = useState<BulkImageCandidateProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState("");

  const [files, setFiles] = useState<BulkImageInputFile[]>([]);
  const fileObjectsRef = useRef<Map<string, File>>(new Map());
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const previewUrlsRef = useRef<Record<string, string>>({});
  const [decisions, setDecisions] = useState<Record<string, BulkImageDecision>>({});
  const [globalReplaceAuthorized, setGlobalReplaceAuthorized] = useState(false);
  const [selectionError, setSelectionError] = useState("");

  const [stage, setStage] = useState<Stage>("select");
  const [executionStates, setExecutionStates] = useState<Record<string, { state: BulkQueueItemState; error?: string }>>({});
  const [showOnlyFailed, setShowOnlyFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const cancelledRef = useRef(false);
  /**
   * Instantanea de las filas tomada justo antes de confirmar (seccion 13:
   * "congelar las asociaciones del Preview" durante la carga). Sin esto,
   * refrescar `products` despues del lote (para ver las imagenes recien
   * subidas) reclasificaria en vivo cada fila recien subida como "ya tiene
   * imagen", corrompiendo el resumen final.
   */
  const [frozenRows, setFrozenRows] = useState<BulkImageRow[] | null>(null);

  async function loadProducts() {
    setProductsLoading(true);
    setProductsError("");
    try {
      const data = await fetchJson("/api/admin/products", { cache: "no-store" });
      setProducts((data.products ?? []).map(toCandidateProduct));
    } catch (err) {
      setProductsError(err instanceof Error ? err.message : "No fue posible cargar los productos.");
    } finally {
      setProductsLoading(false);
    }
  }

  useEffect(() => {
    void loadProducts();
  }, []);

  useEffect(() => {
    previewUrlsRef.current = previewUrls;
  }, [previewUrls]);

  // Libera todos los object URLs al desmontar el panel (seccion 16).
  useEffect(() => {
    return () => {
      for (const url of Object.values(previewUrlsRef.current)) URL.revokeObjectURL(url);
      previewUrlsRef.current = {};
      fileObjectsRef.current.clear();
      document.body.style.removeProperty("overflow");
    };
  }, []);

  const liveRows = useMemo(
    () => matchBulkProductImages(files, products, decisions, { globalReplaceAuthorized }),
    [files, products, decisions, globalReplaceAuthorized]
  );

  /** Fuera de "select" se usa la instantanea congelada; en "select" el Preview sigue siendo interactivo. */
  const displayRows = frozenRows ?? liveRows;

  const canConfirm = stage === "select" && canConfirmBulkUpload(liveRows);
  const finalSummary = useMemo(
    () => computeBulkImageFinalSummary(displayRows, executionStates),
    [displayRows, executionStates]
  );

  async function handleFilesSelected(newFiles: File[]) {
    setSelectionError("");
    const countCheck = checkBulkFileCountLimit(files.length, newFiles.length, BULK_PRODUCT_IMAGE_MAX_FILES);
    if (!countCheck.ok) {
      setSelectionError(countCheck.reason);
      return;
    }

    const additions: BulkImageInputFile[] = [];
    const newPreviewUrls: Record<string, string> = {};

    for (const file of newFiles) {
      const fileId = crypto.randomUUID();
      fileObjectsRef.current.set(fileId, file);
      newPreviewUrls[fileId] = URL.createObjectURL(file);
      const contentHash = await computeContentHash(file);
      additions.push({
        fileId,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        contentHash
      });
    }

    setFiles((prev) => [...prev, ...additions]);
    setPreviewUrls((prev) => ({ ...prev, ...newPreviewUrls }));
  }

  function removeFile(fileId: string) {
    setFiles((prev) => prev.filter((file) => file.fileId !== fileId));
    setPreviewUrls((prev) => {
      const { [fileId]: removed, ...rest } = prev;
      if (removed) URL.revokeObjectURL(removed);
      return rest;
    });
    setDecisions((prev) => {
      const next = { ...prev };
      delete next[fileId];
      return next;
    });
    fileObjectsRef.current.delete(fileId);
  }

  function clearSelection() {
    for (const url of Object.values(previewUrlsRef.current)) URL.revokeObjectURL(url);
    previewUrlsRef.current = {};
    setFiles([]);
    setPreviewUrls({});
    setDecisions({});
    setGlobalReplaceAuthorized(false);
    setSelectionError("");
    fileObjectsRef.current.clear();
  }

  function setExcluded(fileId: string, excluded: boolean) {
    setDecisions((prev) => ({ ...prev, [fileId]: { ...prev[fileId], excluded } }));
  }

  function setManualMatch(fileId: string, productId: string | null) {
    setDecisions((prev) => ({ ...prev, [fileId]: { ...prev[fileId], manualProductId: productId } }));
  }

  function setReplaceRequested(fileId: string, requested: boolean) {
    setDecisions((prev) => ({ ...prev, [fileId]: { ...prev[fileId], replaceRequested: requested } }));
  }

  async function uploadOne(job: BulkQueueJob) {
    const file = fileObjectsRef.current.get(job.fileId);
    if (!file) throw new Error("El archivo ya no está disponible.");

    const formData = new FormData();
    formData.append("file", file);

    if (job.action === "REPLACE") {
      // El servidor exige esta ruta para autorizar el reemplazo (Fase
      // 7.3A): nunca se envia replaceExisting sin ella, ni se infiere nada
      // en el cliente -- si falta, el motor de matching ya dejo la fila
      // como no lista y esta funcion nunca deberia ser invocada para ella.
      if (!job.expectedImageStoragePath) {
        throw new Error("Falta la imagen actual esperada para autorizar el reemplazo.");
      }
      formData.append("replaceExisting", "true");
      formData.append("expectedImageStoragePath", job.expectedImageStoragePath);
    }

    const data = await fetchJson(`/api/admin/products/${job.productId}/image`, {
      method: "POST",
      body: formData
    });

    if (!data.product || !data.imageStoragePath || !data.imageUrl) {
      throw new Error("La imagen se guardó pero no se pudo confirmar el producto actualizado.");
    }

    return { imageUrl: data.imageUrl as string, imageStoragePath: data.imageStoragePath as string };
  }

  async function runQueueFor(jobs: BulkQueueJob[]) {
    setExecutionStates((prev) => {
      const next = { ...prev };
      for (const job of jobs) next[job.fileId] = { state: "PENDING" };
      return next;
    });

    return runBulkImageUploadQueue(jobs, {
      uploadFn: uploadOne,
      isCancelled: () => cancelledRef.current,
      onItemStateChange: (job, state, result) => {
        setExecutionStates((prev) => ({
          ...prev,
          [job.fileId]: { state, error: result?.state === "FAILED" ? result.error : undefined }
        }));
      }
    });
  }

  async function confirmUpload() {
    if (!canConfirm) return;

    const readyRows = liveRows.filter((row) => row.ready);
    const hasReplacements = readyRows.some((row) => row.action === "REPLACE");

    if (hasReplacements) {
      const confirmed = await feedback.confirm({
        title: "¿Reemplazar imágenes existentes?",
        description: `Vas a reemplazar la imagen de ${readyRows.filter((r) => r.action === "REPLACE").length} producto(s) que ya tienen una foto. Esta acción no se puede deshacer.`,
        confirmLabel: "Confirmar carga",
        cancelLabel: "Cancelar",
        tone: "danger"
      });
      if (!confirmed) return;
    }

    cancelledRef.current = false;
    setShowOnlyFailed(false);
    setFrozenRows(liveRows);
    setStage("uploading");

    const jobs: BulkQueueJob[] = readyRows.map((row) => ({
      fileId: row.fileId,
      productId: row.matchedProductId as string,
      action: row.action as "UPLOAD" | "REPLACE",
      expectedImageStoragePath: row.expectedImageStoragePath
    }));

    const results = await runQueueFor(jobs);

    // El resumen usa frozenRows; ya no necesita mantener archivos/miniaturas
    // montados. Solo se conservan File reales fallidos para un retry manual.
    for (const url of Object.values(previewUrlsRef.current)) URL.revokeObjectURL(url);
    previewUrlsRef.current = {};
    setPreviewUrls({});
    setFiles([]);
    setDecisions({});
    setGlobalReplaceAuthorized(false);
    for (const result of results) {
      if (result.state !== "FAILED") fileObjectsRef.current.delete(result.fileId);
    }
    document.body.style.removeProperty("overflow");
    setStage("summary");
    void loadProducts();
  }

  function cancelUpload() {
    cancelledRef.current = true;
  }

  async function retryFailed() {
    const failedFileIds = Object.entries(executionStates)
      .filter(([, value]) => value.state === "FAILED")
      .map(([fileId]) => fileId);

    if (failedFileIds.length === 0) return;

    setRetrying(true);
    cancelledRef.current = false;

    const jobs: BulkQueueJob[] = failedFileIds
      .map((fileId) => displayRows.find((row) => row.fileId === fileId))
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .map((row) => ({
        fileId: row.fileId,
        productId: row.matchedProductId as string,
        action: row.action as "UPLOAD" | "REPLACE",
        expectedImageStoragePath: row.expectedImageStoragePath
      }));

    const results = await runQueueFor(jobs);
    for (const result of results) {
      if (result.state !== "FAILED") fileObjectsRef.current.delete(result.fileId);
    }
    document.body.style.removeProperty("overflow");
    setRetrying(false);
    void loadProducts();
  }

  function startNewBatch() {
    clearSelection();
    setExecutionStates({});
    setShowOnlyFailed(false);
    setFrozenRows(null);
    setStage("select");
  }

  function exportJson() {
    const payload = buildBulkImageExportSummary(displayRows, executionStates);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `carga-masiva-imagenes-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const successCount = Object.values(executionStates).filter((item) => item.state === "SUCCESS").length;
  const failedCount = Object.values(executionStates).filter((item) => item.state === "FAILED").length;
  const completedCount = Object.values(executionStates).filter((item) =>
    ["SUCCESS", "FAILED", "SKIPPED"].includes(item.state)
  ).length;
  const totalQueued = Object.keys(executionStates).length;
  const progressPercent = totalQueued > 0 ? Math.round((completedCount / totalQueued) * 100) : 0;
  const currentlyUploadingProductNames = Object.entries(executionStates)
    .filter(([, value]) => value.state === "UPLOADING")
    .map(([fileId]) => {
      const matchedProductId = displayRows.find((row) => row.fileId === fileId)?.matchedProductId;
      return products.find((product) => product.id === matchedProductId)?.nombre;
    })
    .filter((name): name is string => Boolean(name));

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-[#191714]">Carga masiva de imágenes</h2>
          <p className="text-sm text-[#6B6258]">
            Selecciona muchas fotos a la vez, revisa la asociación con cada producto y confirma antes de subir nada.
          </p>
        </div>
        <Link
          href="/admin/catalogo/productos"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#DDD0C1] px-4 py-2.5 text-sm font-semibold text-[#4D453D]"
        >
          Volver a Productos
        </Link>
      </div>

      {productsError ? (
        <div className="flex items-start gap-2 rounded-xl border border-[#f3c6c0] bg-[#fdf1ef] px-4 py-3 text-sm text-[#8a2c22]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{productsError}</span>
        </div>
      ) : null}

      {!productsLoading && products.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-[#DDD0C1] bg-white p-6 text-sm text-[#6B6258]">
          <p>No hay productos disponibles para asociar imágenes.</p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/catalogo/productos"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#DDD0C1] px-4 py-2.5 text-sm font-semibold text-[#4D453D]"
            >
              <PackagePlus className="h-4 w-4" />
              Ir a Productos
            </Link>
            <Link
              href="/admin/importar-catalogo"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#DDD0C1] px-4 py-2.5 text-sm font-semibold text-[#4D453D]"
            >
              <UploadCloud className="h-4 w-4" />
              Importar catálogo
            </Link>
          </div>
        </div>
      ) : null}

      {stage !== "summary" ? (
        <>
          <p className="rounded-xl border border-[#DDD0C1] bg-[#F7F1E8] px-4 py-3 text-xs leading-5 text-[#6B6258]">
            <span className="font-semibold text-[#4D453D]">Cómo nombrar cada archivo:</span> usa el mismo nombre
            del perfume tal como aparece en el CSV importado (ej.: &quot;Acqua Di Gio Profondo.jpg&quot;,
            &quot;Lattafa Asad.png&quot;). No hace falta escribir el SKU en el nombre del archivo — es opcional y
            solo se usa como respaldo si el nombre coincide con más de un producto.
          </p>

          <BulkImageDropzone disabled={stage === "uploading"} onFilesSelected={handleFilesSelected} />

          {selectionError ? (
            <p className="flex items-start gap-1.5 text-sm text-[#8a2c22]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {selectionError}
            </p>
          ) : null}

          {files.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-[#6B6258]">
                {files.length} de {BULK_PRODUCT_IMAGE_MAX_FILES} imágenes seleccionadas
              </p>
              {stage === "select" ? (
                <button
                  type="button"
                  onClick={clearSelection}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#DDD0C1] px-3 py-1.5 text-xs font-semibold text-[#4D453D] hover:bg-[#F7F1E8]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Limpiar selección
                </button>
              ) : null}
            </div>
          ) : null}

          {files.length > 0 ? <BulkImagePreviewSummaryBar rows={displayRows} /> : null}

          {files.length > 0 && stage === "select" ? (
            <label className="flex items-start gap-2 rounded-xl border border-[#DDD0C1] bg-white p-3 text-sm text-[#4D453D]">
              <input
                type="checkbox"
                checked={globalReplaceAuthorized}
                onChange={(event) => setGlobalReplaceAuthorized(event.target.checked)}
                className="mt-0.5"
              />
              <span>
                <span className="font-semibold">Autorizar reemplazos seleccionados.</span>{" "}
                Actívalo solo si quieres reemplazar la imagen de productos que ya tienen una foto (marcados abajo con
                &quot;Reemplazar imagen existente&quot;).
              </span>
            </label>
          ) : null}

          {files.length > 0 ? (
            <BulkImagePreview
              rows={displayRows}
              previewUrls={previewUrls}
              products={products}
              disabled={stage === "uploading"}
              globalReplaceAuthorized={globalReplaceAuthorized}
              onExclude={setExcluded}
              onManualMatch={setManualMatch}
              onReplaceRequestChange={setReplaceRequested}
              onRemove={removeFile}
              executionStates={executionStates}
            />
          ) : null}

          {files.length > 0 ? (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={!canConfirm}
                onClick={() => void confirmUpload()}
                className="app-button-primary inline-flex min-h-11 items-center gap-2 px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ImagePlus className="h-4 w-4" />
                Confirmar carga
              </button>
              {stage === "uploading" ? (
                <button
                  type="button"
                  onClick={cancelUpload}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#DDD0C1] px-4 py-2.5 text-sm font-semibold text-[#4D453D]"
                >
                  <X className="h-4 w-4" />
                  Cancelar pendientes
                </button>
              ) : null}
            </div>
          ) : null}

          {stage === "uploading" ? (
            <div className="space-y-2 rounded-2xl border border-[#DDD0C1] bg-white p-4">
              <div className="flex items-center justify-between text-sm font-semibold text-[#4D453D]">
                <span>Subiendo imágenes…</span>
                <span>{progressPercent}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[#EEE5DA]">
                <div
                  className="h-full rounded-full bg-[#8A6036] transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p className="text-xs text-[#6B6258]">
                {completedCount} de {totalQueued} completados · {successCount} exitosas · {failedCount} fallidas
              </p>
              {currentlyUploadingProductNames.length > 0 ? (
                <p className="text-xs text-[#6B6258]">
                  Producto actual: {currentlyUploadingProductNames.join(", ")}
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}

      {stage === "summary" ? (
        <>
          <BulkImageFinalSummaryPanel
            summary={finalSummary}
            showOnlyFailed={showOnlyFailed}
            onShowOnlyFailedChange={setShowOnlyFailed}
            onRetryFailed={() => void retryFailed()}
            onStartNewBatch={startNewBatch}
            onExportJson={exportJson}
            retrying={retrying}
          />
          <BulkImagePreview
            rows={displayRows}
            previewUrls={previewUrls}
            products={products}
            disabled
            globalReplaceAuthorized={globalReplaceAuthorized}
            onExclude={setExcluded}
            onManualMatch={setManualMatch}
            onReplaceRequestChange={setReplaceRequested}
            onRemove={removeFile}
            executionStates={executionStates}
            showOnlyFailed={showOnlyFailed}
          />
        </>
      ) : null}
    </div>
  );
}
