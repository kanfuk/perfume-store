"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  CircleDollarSign,
  Home,
  ShieldQuestion,
  ShoppingBag,
  Store,
  UploadCloud
} from "lucide-react";
import Link from "next/link";
import { formatCurrency } from "@/lib/format";
import { CatalogQualityReview } from "@/components/admin/CatalogQualityReview";
import { CatalogImportFinalSummary } from "@/components/admin/CatalogImportFinalSummary";
import type {
  FinalPlanRow,
  QualityDecision,
  QualityFinding,
  QualityReviewSummary
} from "@/lib/catalog-import/quality-review.ts";

type ProfileChoice = "auto" | "proveedor" | "canonico";
type PlanAction = "CREAR" | "ACTUALIZAR" | "BLOQUEADO";

type CanonicalPlanRow = {
  row: {
    rowNumber: number;
    sku: string;
    nombre: string;
    marca: string;
    contenido: string;
    precioVenta: number | null;
    stock: number | null;
    activo: boolean;
    esTop: boolean;
    ordenDestacado: number | null;
  };
  action: PlanAction;
  reasons: string[];
};

type SupplierPlanRow = {
  rowNumber: number;
  sku: string;
  nombre: string;
  marca: string;
  contenido: string;
  costoUnitario: number;
  precioVentaSugerido: number;
  precioVentaFinal: number;
  modoPrecio: "AUTO" | "MANUAL";
  action: "CREAR" | "ACTUALIZAR";
};

type RowError = { rowNumber: number; sku: string; message: string };

type CanonicalPreview = {
  totalFilas: number;
  erroresFila: RowError[];
  plan: CanonicalPlanRow[];
  resumen: { crear: number; actualizar: number; bloqueado: number };
  erroresGlobales: string[];
};

type SupplierPreview = {
  porcentajeAplicado: number;
  filasFisicas: number;
  filasVacias: number;
  filasUtiles: number;
  erroresFila: RowError[];
  plan: SupplierPlanRow[];
  resumen: { crear: number; actualizar: number; bloqueado: number };
  erroresGlobales: string[];
};

type PreviewResponse =
  | { perfil: "canonico"; previewHash: string; preview: CanonicalPreview }
  | { perfil: "proveedor"; previewHash: string; preview: SupplierPreview };

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.readAsDataURL(file);
  });
}

const MAX_CLIENT_FILE_SIZE = 2 * 1024 * 1024;
const DEFAULT_MARKUP = 35;

const PREVIEW_STAGES = [
  "Leyendo archivo…",
  "Validando estructura…",
  "Generando SKU…",
  "Calculando precios…",
  "Preparando vista previa…"
];
const QUALITY_REVIEW_STAGES = ["Analizando posibles duplicados…", "Comparando con el catálogo…", "Preparando revisión…"];
const FINAL_PLAN_STAGES = ["Aplicando decisiones…", "Generando catálogo final…"];
const CONFIRM_STAGES = ["Importando productos…", "Actualizando catálogo…", "Finalizando…"];

type Phase = "idle" | "previewing" | "quality-reviewing" | "building-plan" | "confirming";
type Step = "preview" | "quality-review" | "final-summary" | "done";
type LastAction = "preview" | "quality-review" | "final-plan" | "confirm" | null;

export function CatalogImportPanel() {
  const [fileName, setFileName] = useState("");
  const [fileBase64, setFileBase64] = useState("");
  const [profileChoice, setProfileChoice] = useState<ProfileChoice>("auto");
  const [markupPercentage, setMarkupPercentage] = useState(String(DEFAULT_MARKUP));
  const [result, setResult] = useState<PreviewResponse | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [step, setStep] = useState<Step>("preview");
  const [stageIndex, setStageIndex] = useState(0);
  const [error, setError] = useState("");
  const [lastAction, setLastAction] = useState<LastAction>(null);
  const [confirmResult, setConfirmResult] = useState<{ creados: number; actualizados: number } | null>(null);

  const [reviewHash, setReviewHash] = useState("");
  const [findings, setFindings] = useState<QualityFinding[]>([]);
  const [summary, setSummary] = useState<QualityReviewSummary | null>(null);
  const [decisions, setDecisions] = useState<Record<string, QualityDecision>>({});
  const [finalPlan, setFinalPlan] = useState<FinalPlanRow[] | null>(null);

  const busy = phase !== "idle";
  const stages =
    phase === "previewing"
      ? PREVIEW_STAGES
      : phase === "quality-reviewing"
        ? QUALITY_REVIEW_STAGES
        : phase === "building-plan"
          ? FINAL_PLAN_STAGES
          : phase === "confirming"
            ? CONFIRM_STAGES
            : [];
  const stageLabel = stages[stageIndex] ?? "";

  useEffect(() => {
    if (phase === "idle") return;
    const activeStages =
      phase === "previewing"
        ? PREVIEW_STAGES
        : phase === "quality-reviewing"
          ? QUALITY_REVIEW_STAGES
          : phase === "building-plan"
            ? FINAL_PLAN_STAGES
            : CONFIRM_STAGES;
    const id = setInterval(() => {
      setStageIndex((prev) => Math.min(prev + 1, activeStages.length - 1));
    }, 450);
    return () => clearInterval(id);
  }, [phase]);

  function resetPreviewState() {
    setResult(null);
    setConfirmResult(null);
    setError("");
    setStep("preview");
    setReviewHash("");
    setFindings([]);
    setSummary(null);
    setDecisions({});
    setFinalPlan(null);
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    if (busy) return;
    const file = event.target.files?.[0];
    resetPreviewState();

    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Solo se aceptan archivos .csv.");
      return;
    }

    if (file.size > MAX_CLIENT_FILE_SIZE) {
      setError("El archivo supera el tamaño máximo permitido (2 MiB).");
      return;
    }

    setFileName(file.name);
    const base64 = await readFileAsBase64(file);
    setFileBase64(base64);
  }

  function handleProfileChange(value: ProfileChoice) {
    if (busy) return;
    setProfileChoice(value);
    resetPreviewState();
  }

  function handleMarkupChange(value: string) {
    if (busy) return;
    setMarkupPercentage(value);
    resetPreviewState();
  }

  async function requestPreview() {
    if (busy) return;
    if (!fileBase64 || !fileName) {
      setError("Selecciona un archivo CSV primero.");
      return;
    }

    setPhase("previewing");
    setStageIndex(0);
    setLastAction("preview");
    setError("");
    setConfirmResult(null);
    setReviewHash("");
    setFindings([]);
    setSummary(null);
    setDecisions({});
    setFinalPlan(null);

    try {
      const response = await fetch("/api/admin/products/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "preview",
          fileName,
          fileBase64,
          profile: profileChoice,
          markupPercentage: Number(markupPercentage)
        })
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "No fue posible previsualizar el archivo.");
        setResult(null);
        return;
      }

      setResult(data);
      setStep("preview");
    } catch {
      setError("No fue posible conectar con el servidor.");
    } finally {
      setPhase("idle");
    }
  }

  async function requestQualityReview() {
    if (busy || !result || result.perfil !== "proveedor") return;

    setPhase("quality-reviewing");
    setStageIndex(0);
    setLastAction("quality-review");
    setError("");

    try {
      const response = await fetch("/api/admin/products/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "quality-review",
          fileName,
          fileBase64,
          profile: "proveedor",
          markupPercentage: Number(markupPercentage),
          previewHash: result.previewHash
        })
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "No fue posible analizar la calidad del archivo.");
        return;
      }

      setReviewHash(data.reviewHash);
      setFindings(data.findings);
      setSummary(data.summary);
      setStep("quality-review");
    } catch {
      setError("No fue posible conectar con el servidor.");
    } finally {
      setPhase("idle");
    }
  }

  async function requestFinalPlan(nextDecisions: QualityDecision[]) {
    if (busy || !result || result.perfil !== "proveedor") return;

    setPhase("building-plan");
    setStageIndex(0);
    setLastAction("final-plan");
    setError("");

    try {
      const response = await fetch("/api/admin/products/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "final-plan",
          fileName,
          fileBase64,
          profile: "proveedor",
          markupPercentage: Number(markupPercentage),
          previewHash: result.previewHash,
          reviewHash,
          decisions: nextDecisions
        })
      });
      const data = await response.json();

      if (!response.ok) {
        setError(
          data.error ??
            "No se puede continuar: hay conflictos bloqueantes sin resolver en la revisión de calidad."
        );
        return;
      }

      setFinalPlan(data.plan);
      setStep("final-summary");
    } catch {
      setError("No fue posible conectar con el servidor.");
    } finally {
      setPhase("idle");
    }
  }

  async function confirmImport() {
    if (busy || !fileBase64 || !fileName || !result) return;

    setPhase("confirming");
    setStageIndex(0);
    setLastAction("confirm");
    setError("");

    try {
      const body: Record<string, unknown> = {
        action: "confirm",
        fileName,
        fileBase64,
        profile: profileChoice,
        markupPercentage: Number(markupPercentage),
        previewHash: result.previewHash
      };

      if (result.perfil === "proveedor") {
        body.profile = "proveedor";
        body.reviewHash = reviewHash;
        body.decisions = Object.values(decisions);
      }

      const response = await fetch("/api/admin/products/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "No fue posible confirmar la importación. Genera una vista previa nueva.");
        return;
      }

      setConfirmResult({ creados: data.creados, actualizados: data.actualizados });
      setStep("done");
    } catch {
      setError("No fue posible conectar con el servidor.");
    } finally {
      setPhase("idle");
    }
  }

  function retryLastAction() {
    if (busy) return;
    if (lastAction === "confirm") {
      void confirmImport();
    } else if (lastAction === "final-plan") {
      void requestFinalPlan(Object.values(decisions));
    } else if (lastAction === "quality-review") {
      void requestQualityReview();
    } else if (lastAction === "preview") {
      void requestPreview();
    }
  }

  const preview = result?.preview;
  const canConfirmCanonico =
    result?.perfil === "canonico" && !!preview && preview.erroresGlobales.length === 0 && preview.plan.length > 0 && !confirmResult;

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-[1200px] flex-col gap-6 overflow-x-hidden bg-[#f7f8fa] px-4 py-4 pb-[calc(88px+env(safe-area-inset-bottom))] sm:px-6 lg:px-8">
      <section className="overflow-hidden rounded-2xl bg-[#17191f] text-white shadow-[0_16px_36px_rgba(17,19,24,0.16)]">
        <div className="bg-[radial-gradient(circle_at_80%_20%,rgba(115,87,255,0.34),transparent_28%)] p-6 sm:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <span className="inline-flex w-fit items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#c8c0ff]">
                <ShoppingBag className="h-3.5 w-3.5" />
                Admin Smellme.cl
              </span>
              <h1 className="text-3xl font-bold tracking-[-0.04em] text-white sm:text-4xl">
                Importar catálogo (CSV)
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-white/60 sm:text-base">
                Acepta el catálogo técnico (sku, nombre, marca, contenido, costo, precio, stock...)
                o el CSV habitual del proveedor (Perfume, Marca, Contenido, Precio Compra). Primero
                se genera una vista previa; nada se guarda hasta que confirmes.
              </p>
            </div>
            <Link
              href="/admin"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-center text-sm font-semibold text-white"
            >
              <Home className="h-4 w-4" />
              <span className="hidden sm:inline">Inicio</span>
            </Link>
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-[#e4e7ec] bg-white p-5 shadow-sm sm:p-6">
        {step === "preview" ? (
          <>
            <fieldset disabled={busy} className="contents">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileChange}
                  aria-label="Seleccionar archivo CSV"
                  className="block w-full rounded-xl border border-[#e4e7ec] bg-[#f7f8fa] px-3 py-2.5 text-sm text-[#344054] disabled:cursor-not-allowed disabled:opacity-60"
                />
                <div className="flex flex-col gap-1">
                  <label htmlFor="profile-choice" className="text-xs font-semibold text-[#667085]">
                    Tipo de archivo
                  </label>
                  <select
                    id="profile-choice"
                    value={profileChoice}
                    onChange={(event) => handleProfileChange(event.target.value as ProfileChoice)}
                    className="rounded-xl border border-[#e4e7ec] bg-white px-3 py-2.5 text-sm text-[#344054] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="auto">Detección automática</option>
                    <option value="proveedor">CSV de proveedor</option>
                    <option value="canonico">Catálogo canónico</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="markup-percentage" className="text-xs font-semibold text-[#667085]">
                    Recargo sobre costo (%)
                  </label>
                  <input
                    id="markup-percentage"
                    type="number"
                    min={0}
                    max={300}
                    value={markupPercentage}
                    onChange={(event) => handleMarkupChange(event.target.value)}
                    className="w-28 rounded-xl border border-[#e4e7ec] bg-white px-3 py-2.5 text-sm text-[#344054] disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>
              </div>

              <p className="text-xs text-[#667085]">
                El precio de venta se calcula agregando este porcentaje al costo. El archivo habitual del
                proveedor no necesita SKU ni precio de venta: el sistema genera ambos automáticamente.
              </p>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={requestPreview}
                  disabled={!fileBase64 || busy}
                  className="app-button-primary inline-flex min-h-12 items-center justify-center gap-2 px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {phase === "previewing" ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
                  ) : (
                    <UploadCloud className="h-4 w-4" />
                  )}
                  {phase === "previewing" ? "Analizando..." : "Vista previa"}
                </button>
              </div>
            </fieldset>

            {busy ? (
              <div className="space-y-2 rounded-xl border border-[#e4e7ec] bg-[#f7f8fa] px-4 py-3">
                <div className="indeterminate-progress-track" role="progressbar" aria-label="Progreso de la importación">
                  <div className="indeterminate-progress-fill" />
                </div>
                <p aria-live="polite" role="status" className="text-sm font-medium text-[#344054]">
                  {stageLabel}
                </p>
              </div>
            ) : null}

            {error ? (
              <div className="flex items-start justify-between gap-3 rounded-xl border border-[#f3c6c0] bg-[#fdf1ef] px-4 py-3 text-sm text-[#8a2c22]">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
                {lastAction ? (
                  <button
                    type="button"
                    onClick={retryLastAction}
                    disabled={busy}
                    className="shrink-0 rounded-lg border border-[#8a2c22]/30 px-3 py-1.5 text-xs font-semibold text-[#8a2c22] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Reintentar
                  </button>
                ) : null}
              </div>
            ) : null}

            {result ? (
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full bg-[#eeebff] px-4 py-1.5 text-xs font-semibold text-[#5434e6]">
                  Perfil detectado: {result.perfil === "proveedor" ? "CSV de proveedor" : "Catálogo canónico"}
                  {result.perfil === "proveedor" ? ` · Recargo aplicado: ${result.preview.porcentajeAplicado}%` : null}
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <SummaryTile label="Crear" value={result.preview.resumen.crear} tone="create" />
                  <SummaryTile label="Actualizar" value={result.preview.resumen.actualizar} tone="update" />
                  <SummaryTile label="Bloqueados" value={result.preview.resumen.bloqueado} tone="block" />
                  <SummaryTile
                    label="Filas totales"
                    value={result.perfil === "proveedor" ? result.preview.filasUtiles : result.preview.totalFilas}
                    tone="neutral"
                  />
                </div>

                {result.preview.erroresGlobales.length > 0 ? (
                  <div className="space-y-1 rounded-xl border border-[#f3c6c0] bg-[#fdf1ef] px-4 py-3 text-sm text-[#8a2c22]">
                    <p className="font-semibold">No se puede confirmar mientras existan estos errores:</p>
                    <ul className="list-disc space-y-0.5 pl-5">
                      {result.preview.erroresGlobales.map((message, index) => (
                        <li key={index}>{message}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {result.perfil === "proveedor" ? (
                  <SupplierPlanTable plan={result.preview.plan} />
                ) : (
                  <CanonicalPlanTable plan={result.preview.plan} />
                )}

                {result.preview.erroresFila.length > 0 ? (
                  <div className="space-y-2 rounded-xl border border-[#fbe3b0] bg-[#fff8ec] px-4 py-3 text-sm text-[#8a5a00]">
                    <p className="font-semibold">Filas bloqueadas ({result.preview.erroresFila.length}):</p>
                    <ul className="max-h-48 list-disc space-y-1 overflow-y-auto pl-5">
                      {result.preview.erroresFila.map((rowError, index) => (
                        <li key={index}>
                          Fila {rowError.rowNumber} ({rowError.sku || "sin SKU"}): {rowError.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="flex justify-end">
                  {result.perfil === "proveedor" ? (
                    <button
                      type="button"
                      onClick={requestQualityReview}
                      disabled={result.preview.plan.length === 0 || busy}
                      className="app-button-primary inline-flex min-h-12 items-center justify-center gap-2 px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {phase === "quality-reviewing" ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
                      ) : (
                        <ShieldQuestion className="h-4 w-4" />
                      )}
                      {phase === "quality-reviewing" ? "Analizando..." : "Revisar inconsistencias"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={confirmImport}
                      disabled={!canConfirmCanonico || busy}
                      className="app-button-primary inline-flex min-h-12 items-center justify-center gap-2 px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {phase === "confirming" ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
                      ) : null}
                      {phase === "confirming" ? "Aplicando..." : "Confirmar importación"}
                    </button>
                  )}
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {step === "quality-review" && summary ? (
          <>
            {busy ? (
              <div className="space-y-2 rounded-xl border border-[#e4e7ec] bg-[#f7f8fa] px-4 py-3">
                <div className="indeterminate-progress-track" role="progressbar" aria-label="Progreso de la revisión">
                  <div className="indeterminate-progress-fill" />
                </div>
                <p aria-live="polite" role="status" className="text-sm font-medium text-[#344054]">
                  {stageLabel}
                </p>
              </div>
            ) : null}
            {error ? (
              <div className="flex items-start justify-between gap-3 rounded-xl border border-[#f3c6c0] bg-[#fdf1ef] px-4 py-3 text-sm text-[#8a2c22]">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
                <button
                  type="button"
                  onClick={retryLastAction}
                  disabled={busy}
                  className="shrink-0 rounded-lg border border-[#8a2c22]/30 px-3 py-1.5 text-xs font-semibold text-[#8a2c22] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Reintentar
                </button>
              </div>
            ) : null}
            <CatalogQualityReview
              findings={findings}
              summary={summary}
              busy={busy}
              decisions={decisions}
              onDecisionsChange={setDecisions}
              onBack={() => setStep("preview")}
              onContinue={(nextDecisions) => {
                setDecisions(Object.fromEntries(nextDecisions.map((d) => [d.findingId, d])));
                void requestFinalPlan(nextDecisions);
              }}
            />
          </>
        ) : null}

        {step === "final-summary" && summary && finalPlan ? (
          <>
            {error ? (
              <div className="flex items-start justify-between gap-3 rounded-xl border border-[#f3c6c0] bg-[#fdf1ef] px-4 py-3 text-sm text-[#8a2c22]">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
                <button
                  type="button"
                  onClick={retryLastAction}
                  disabled={busy}
                  className="shrink-0 rounded-lg border border-[#8a2c22]/30 px-3 py-1.5 text-xs font-semibold text-[#8a2c22] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Reintentar
                </button>
              </div>
            ) : null}
            {busy ? (
              <div className="space-y-2 rounded-xl border border-[#e4e7ec] bg-[#f7f8fa] px-4 py-3">
                <div className="indeterminate-progress-track" role="progressbar" aria-label="Progreso de la importación">
                  <div className="indeterminate-progress-fill" />
                </div>
                <p aria-live="polite" role="status" className="text-sm font-medium text-[#344054]">
                  {stageLabel}
                </p>
              </div>
            ) : null}
            <CatalogImportFinalSummary
              plan={finalPlan}
              summary={summary}
              busy={busy}
              onBack={() => setStep("quality-review")}
              onConfirm={confirmImport}
            />
          </>
        ) : null}

        {step === "done" && confirmResult ? (
          <div className="space-y-3 rounded-xl border border-[#bfe6c6] bg-[#eefbf1] px-4 py-4 text-sm text-[#1f6d33]">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Importación aplicada: {confirmResult.creados} creados, {confirmResult.actualizados}{" "}
                actualizados.
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/admin/stock"
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-[#1f6d33] shadow-sm"
              >
                <Boxes className="h-4 w-4" />
                Revisar stock
              </Link>
              <Link
                href="/admin/precios"
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-[#1f6d33] shadow-sm"
              >
                <CircleDollarSign className="h-4 w-4" />
                Editar precios
              </Link>
              <Link
                href="/"
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-[#1f6d33] shadow-sm"
              >
                <Store className="h-4 w-4" />
                Ver catálogo público
              </Link>
              <Link
                href="/admin"
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-[#1f6d33] shadow-sm"
              >
                <Home className="h-4 w-4" />
                Volver al inicio
              </Link>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function SupplierPlanTable({ plan }: { plan: SupplierPlanRow[] }) {
  if (plan.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-xl border border-[#e4e7ec]">
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead className="bg-[#f7f8fa] text-xs font-semibold uppercase tracking-wide text-[#667085]">
          <tr>
            <th className="px-4 py-3">Acción</th>
            <th className="px-4 py-3">SKU generado</th>
            <th className="px-4 py-3">Nombre</th>
            <th className="px-4 py-3">Marca</th>
            <th className="px-4 py-3">Costo</th>
            <th className="px-4 py-3">Precio final</th>
            <th className="px-4 py-3">Modo</th>
            <th className="px-4 py-3">Stock</th>
            <th className="px-4 py-3">Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#eef0f3]">
          {plan.map((item) => (
            <tr key={item.sku}>
              <td className="px-4 py-3">
                <ActionBadge action={item.action} />
              </td>
              <td className="px-4 py-3 font-mono text-xs text-[#344054]">{item.sku}</td>
              <td className="px-4 py-3 text-[#111318]">{item.nombre}</td>
              <td className="px-4 py-3 text-[#667085]">{item.marca}</td>
              <td className="px-4 py-3 text-[#111318]">{formatCurrency(item.costoUnitario)}</td>
              <td className="px-4 py-3 text-[#111318]">
                {formatCurrency(item.precioVentaFinal)}
                {item.modoPrecio === "MANUAL" && item.precioVentaFinal !== item.precioVentaSugerido ? (
                  <div className="text-xs text-[#98a2b3]">
                    Sugerido: {formatCurrency(item.precioVentaSugerido)}
                  </div>
                ) : null}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    item.modoPrecio === "MANUAL" ? "bg-[#fff3c4] text-[#8a5a00]" : "bg-[#eeebff] text-[#5434e6]"
                  }`}
                >
                  {item.modoPrecio}
                </span>
              </td>
              <td className="px-4 py-3 text-[#667085]">
                {item.action === "ACTUALIZAR" ? "Se conserva" : "Inicial: 1"}
              </td>
              <td className="px-4 py-3 text-[#667085]">
                {item.action === "ACTUALIZAR" ? "Se conserva" : "Nuevo: activo"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-[#e4e7ec] bg-[#f7f8fa] px-4 py-2 text-xs text-[#667085]">
        Este SKU es provisional: puede cambiar tras la revisión de calidad si se excluyen, unifican o
        renombran filas. Producto nuevo: se creará activo y con stock 1. Producto existente: stock, imagen
        y Top 12 se conservan sin cambios.
      </p>
    </div>
  );
}

function CanonicalPlanTable({ plan }: { plan: CanonicalPlanRow[] }) {
  if (plan.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-xl border border-[#e4e7ec]">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-[#f7f8fa] text-xs font-semibold uppercase tracking-wide text-[#667085]">
          <tr>
            <th className="px-4 py-3">Acción</th>
            <th className="px-4 py-3">SKU</th>
            <th className="px-4 py-3">Nombre</th>
            <th className="px-4 py-3">Marca</th>
            <th className="px-4 py-3">Precio</th>
            <th className="px-4 py-3">Stock</th>
            <th className="px-4 py-3">Top</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#eef0f3]">
          {plan.map((item) => (
            <tr key={item.row.sku}>
              <td className="px-4 py-3">
                <ActionBadge action={item.action} />
              </td>
              <td className="px-4 py-3 font-mono text-xs text-[#344054]">{item.row.sku}</td>
              <td className="px-4 py-3 text-[#111318]">{item.row.nombre}</td>
              <td className="px-4 py-3 text-[#667085]">{item.row.marca}</td>
              <td className="px-4 py-3 text-[#111318]">
                {item.row.precioVenta !== null ? formatCurrency(item.row.precioVenta) : "—"}
              </td>
              <td className="px-4 py-3 text-[#111318]">{item.row.stock ?? "—"}</td>
              <td className="px-4 py-3 text-[#111318]">
                {item.row.esTop ? `#${item.row.ordenDestacado}` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone
}: {
  label: string;
  value: number;
  tone: "create" | "update" | "block" | "neutral";
}) {
  const toneClasses: Record<typeof tone, string> = {
    create: "bg-[#eefbf1] text-[#1f6d33]",
    update: "bg-[#eeebff] text-[#5434e6]",
    block: "bg-[#fdf1ef] text-[#8a2c22]",
    neutral: "bg-[#f7f8fa] text-[#344054]"
  };

  return (
    <div className={`rounded-xl px-4 py-3 ${toneClasses[tone]}`}>
      <div className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}

function ActionBadge({ action }: { action: PlanAction }) {
  const styles: Record<PlanAction, string> = {
    CREAR: "bg-[#eefbf1] text-[#1f6d33]",
    ACTUALIZAR: "bg-[#eeebff] text-[#5434e6]",
    BLOQUEADO: "bg-[#fdf1ef] text-[#8a2c22]"
  };

  const labels: Record<PlanAction, string> = {
    CREAR: "Crear",
    ACTUALIZAR: "Actualizar",
    BLOQUEADO: "Bloqueado"
  };

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${styles[action]}`}>
      {labels[action]}
    </span>
  );
}
