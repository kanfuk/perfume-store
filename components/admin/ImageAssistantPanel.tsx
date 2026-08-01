"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Images, Pause, Play, Search, ShieldCheck, Upload } from "lucide-react";
import Image from "next/image";
import { ConfirmDialog, type ConfirmDialogState } from "@/components/ui/ConfirmDialog";
import type { ImageAssistantAnalysis, ImageAssistantItem } from "@/lib/image-assistant/types";

type AnalysisResponse = {
  analysis: ImageAssistantAnalysis;
  csvFingerprint: string;
  searchConfigured: boolean;
};

type RunState = "IDLE" | "SEARCHING" | "PROCESSING_CANARY" | "CANARY_REVIEW" | "PROCESSING_ALL" | "PAUSED";
type ReportEntry = { productId: string; status: string; at: string; error?: string; sourceDomain?: string; score?: number; sha256?: string };

const buttonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

async function readJson(response: Response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "La operación no pudo completarse.");
  return data;
}

export function ImageAssistantPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState("");
  const [response, setResponse] = useState<AnalysisResponse | null>(null);
  const [items, setItems] = useState<ImageAssistantItem[]>([]);
  const [runState, setRunState] = useState<RunState>("IDLE");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [report, setReport] = useState<ReportEntry[]>([]);
  const [confirm, setConfirm] = useState<ConfirmDialogState>(null);
  const [showPending, setShowPending] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const previewUrlsRef = useRef<Record<string, string>>({});
  const stopRef = useRef(false);

  useEffect(() => () => Object.values(previewUrlsRef.current).forEach((url) => URL.revokeObjectURL(url)), []);

  const summary = useMemo(() => {
    const count = (status: ImageAssistantItem["status"]) => items.filter((item) => item.status === status).length;
    return {
      total: items.length,
      withoutImage: items.filter((item) => item.status !== "YA_TIENE_IMAGEN").length,
      safe: count("AUTO_SEGURO"),
      review: count("REQUIERE_REVISION"),
      noSource: count("SIN_FUENTE_SEGURA"),
      existing: count("YA_TIENE_IMAGEN"),
      excluded: count("EXCLUIDO_QA")
    };
  }, [items]);

  const payload = () => ({ fileName: file?.name ?? "", fileBase64 });

  async function analyze() {
    if (!file) return;
    setError("");
    setMessage("Analizando catálogo sin modificar productos…");
    try {
      const encoded = fileBase64 || await fileToBase64(file);
      setFileBase64(encoded);
      const data = await readJson(await fetch("/api/admin/image-assistant/analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, fileBase64: encoded })
      })) as AnalysisResponse;
      setResponse(data);
      setItems(data.analysis.items);
      setReport([]);
      setRunState("IDLE");
      setMessage(data.searchConfigured
        ? "Análisis listo. Ya puedes buscar candidatos en fuentes aprobadas."
        : "Análisis listo. La búsqueda segura no está configurada; no se subirá ninguna imagen.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No fue posible analizar."); setMessage(""); }
  }

  function updateItem(next: ImageAssistantItem) {
    setItems((current) => current.map((item) => item.productId === next.productId ? next : item));
  }

  async function createPreview(item: ImageAssistantItem) {
    if (!item.candidate) return;
    const previewResponse = await fetch(`/api/admin/image-assistant/${encodeURIComponent(item.productId)}/preview`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload(), candidate: item.candidate })
    });
    if (!previewResponse.ok) return;
    const objectUrl = URL.createObjectURL(await previewResponse.blob());
    const previous = previewUrlsRef.current[item.productId];
    if (previous) URL.revokeObjectURL(previous);
    previewUrlsRef.current = { ...previewUrlsRef.current, [item.productId]: objectUrl };
    setPreviewUrls(previewUrlsRef.current);
  }

  async function runTwoAtATime<T>(entries: T[], task: (entry: T) => Promise<void>) {
    let cursor = 0;
    const worker = async () => {
      while (!stopRef.current) {
        const index = cursor++;
        if (index >= entries.length) return;
        await task(entries[index]);
      }
    };
    await Promise.all([worker(), worker()]);
  }

  async function searchImages() {
    if (!response?.searchConfigured) { setError("Configura un proveedor y dominios aprobados antes de buscar imágenes."); return; }
    const queue = items.filter((item) => item.status === "SIN_FUENTE_SEGURA");
    stopRef.current = false; setRunState("SEARCHING"); setError("");
    await runTwoAtATime(queue, async (item) => {
      try {
        const data = await readJson(await fetch(`/api/admin/image-assistant/${encodeURIComponent(item.productId)}/candidates`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload())
        })) as { item: ImageAssistantItem };
        updateItem(data.item);
        if (data.item.status === "AUTO_SEGURO") await createPreview(data.item);
      } catch (cause) {
        updateItem({ ...item, status: "ERROR", reasons: [cause instanceof Error ? cause.message : "ERROR_BUSQUEDA"] });
      }
    });
    setRunState(stopRef.current ? "PAUSED" : "IDLE");
    setMessage(stopRef.current ? "Búsqueda detenida; puedes continuar sin repetir completados." : "Búsqueda segura terminada.");
  }

  async function processQueue(queue: ImageAssistantItem[], state: RunState) {
    stopRef.current = false; setRunState(state); setError("");
    await runTwoAtATime(queue, async (item) => {
      if (!item.candidate) return;
      try {
        const data = await readJson(await fetch(`/api/admin/image-assistant/${encodeURIComponent(item.productId)}/process`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload(), candidate: item.candidate })
        })) as { result: { source: { domain: string; score: number; sha256: string } } };
        updateItem({ ...item, status: "YA_TIENE_IMAGEN", reasons: ["APLICADA"] });
        setReport((current) => [...current, { productId: item.productId, status: "APPLIED", at: new Date().toISOString(), sourceDomain: data.result.source.domain, score: data.result.source.score, sha256: data.result.source.sha256 }]);
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : "Error de procesamiento";
        updateItem({ ...item, status: "ERROR", reasons: [detail] });
        setReport((current) => [...current, { productId: item.productId, status: "ERROR", at: new Date().toISOString(), error: detail }]);
        stopRef.current = true;
      }
    });
    if (stopRef.current) { setRunState("PAUSED"); setMessage("Lote detenido. Revisa el fallo antes de continuar."); return; }
    if (state === "PROCESSING_CANARY") {
      setRunState("CANARY_REVIEW");
      setMessage("Canary procesado. Verifica visualmente los cinco productos antes de continuar con el resto.");
    } else { setRunState("IDLE"); setMessage("Procesamiento seguro terminado."); }
  }

  function requestProcessing() {
    const safe = items.filter((item) => item.status === "AUTO_SEGURO");
    if (!response?.analysis.batchAllowedByAuditReconciliation) {
      setError("El lote está bloqueado porque la conciliación difiere en más de cinco productos del conjunto observado."); return;
    }
    setConfirm({
      title: "Procesar imágenes seguras",
      description: `Se procesarán ${safe.length} productos con coincidencia segura. Los productos duplicados, ambiguos o marcados para auditoría no serán modificados.`,
      cancelLabel: "Cancelar", confirmLabel: "Procesar imágenes seguras", tone: "warning",
      onCancel: () => setConfirm(null),
      onConfirm: () => { setConfirm(null); void processQueue(safe.slice(0, 5), "PROCESSING_CANARY"); }
    });
  }

  function continueAfterCanary() {
    void processQueue(items.filter((item) => item.status === "AUTO_SEGURO"), "PROCESSING_ALL");
  }

  function downloadReport() {
    if (!response) return;
    const blob = new Blob([JSON.stringify({ generatedAt: new Date().toISOString(), csvFingerprint: response.csvFingerprint, summary, auditReconciliation: { difference: response.analysis.reviewReferenceDifference, batchAllowed: response.analysis.batchAllowedByAuditReconciliation }, items: items.map(({ candidate, ...item }) => ({ ...item, sourceDomain: candidate?.sourceDomain, sourceUrl: candidate?.sourceUrl, score: candidate?.score })), processing: report }, null, 2)], { type: "application/json" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `smellme-image-assistant-${response.csvFingerprint.slice(0, 12)}.json`; link.click(); URL.revokeObjectURL(link.href);
  }

  const busy = ["SEARCHING", "PROCESSING_CANARY", "PROCESSING_ALL"].includes(runState);
  const visibleItems = showPending ? items.filter((item) => ["REQUIERE_REVISION", "SIN_FUENTE_SEGURA", "ERROR"].includes(item.status)) : items.filter((item) => item.status === "AUTO_SEGURO");

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-[#e4e7ec] bg-white p-5 shadow-sm sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7357ff]">Asistente de imágenes</p>
        <h2 className="mt-2 text-xl font-bold text-[#111318]">Carga segura y gradual</h2>
        <p className="mt-2 text-sm leading-6 text-[#667085]">El CSV solo se analiza. Nada se sube hasta confirmar el lote seguro; las imágenes existentes y los productos en auditoría quedan protegidos.</p>
        <label className="mt-5 flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[#c7cdd8] bg-[#f7f8fa] px-4 text-center">
          <Upload className="mb-2 h-5 w-5 text-[#7357ff]" />
          <span className="text-sm font-semibold text-[#344054]">{file?.name ?? "Seleccionar CSV de proveedor"}</span>
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => { const next = event.target.files?.[0] ?? null; setFile(next); setFileBase64(""); setResponse(null); setItems([]); }} />
        </label>
      </section>

      {items.length > 0 && <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[ ["Sin imagen", summary.withoutImage], ["Seguras", summary.safe], ["Revisión", summary.review], ["Sin fuente", summary.noSource], ["Con imagen", summary.existing], ["Excluidos", summary.excluded] ].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-[#e4e7ec] bg-white p-4"><p className="text-xs text-[#667085]">{label}</p><p className="mt-1 text-2xl font-bold text-[#111318]">{value}</p></div>)}
      </section>}

      <section className="flex flex-wrap gap-2 rounded-2xl border border-[#e4e7ec] bg-white p-4">
        <button disabled={!file || busy} onClick={() => void analyze()} className={`${buttonClass} bg-[#7357ff] text-white`}><Search className="h-4 w-4" />Analizar catálogo</button>
        <button disabled={!response || busy || !response.searchConfigured} onClick={() => void searchImages()} className={`${buttonClass} border border-[#7357ff] bg-white text-[#5434e6]`}><Images className="h-4 w-4" />Buscar imágenes</button>
        <button disabled={summary.safe === 0 || busy} onClick={requestProcessing} className={`${buttonClass} bg-[#111318] text-white`}><ShieldCheck className="h-4 w-4" />Procesar coincidencias seguras</button>
        <button disabled={!response || busy} onClick={() => setShowPending(true)} className={`${buttonClass} border border-[#d0d5dd] bg-white text-[#344054]`}>Revisar pendientes</button>
        <button disabled={!response} onClick={downloadReport} className={`${buttonClass} border border-[#d0d5dd] bg-white text-[#344054]`}><Download className="h-4 w-4" />Descargar informe</button>
        {busy && <button onClick={() => { stopRef.current = true; }} className={`${buttonClass} bg-amber-100 text-amber-900`}><Pause className="h-4 w-4" />Detener</button>}
        {runState === "CANARY_REVIEW" && <button onClick={continueAfterCanary} className={`${buttonClass} bg-emerald-600 text-white`}><Play className="h-4 w-4" />Continuar lote</button>}
      </section>

      {(message || error) && <div role="status" className={`rounded-xl border p-4 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{error || message}</div>}

      {response && <section className="space-y-3">
        <div className="flex items-center justify-between"><h3 className="font-semibold text-[#111318]">{showPending ? "Pendientes manuales" : "Vista previa segura"}</h3>{showPending && <button className="text-sm font-semibold text-[#5434e6]" onClick={() => setShowPending(false)}>Ver coincidencias seguras</button>}</div>
        {visibleItems.length === 0 ? <p className="rounded-xl border border-[#e4e7ec] bg-white p-5 text-sm text-[#667085]">No hay productos en esta bandeja.</p> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{visibleItems.map((item) => <article key={item.productId} className="overflow-hidden rounded-xl border border-[#e4e7ec] bg-white">
          {previewUrls[item.productId] && <Image unoptimized width={640} height={640} src={previewUrls[item.productId]} alt={`Vista previa de ${item.name}`} className="aspect-square w-full object-contain bg-white p-4" />}
          <div className="p-4"><p className="text-xs font-semibold text-[#7357ff]">{item.status}{item.score ? ` · ${item.score}/100` : ""}</p><h4 className="mt-1 font-semibold text-[#111318]">{item.brand} {item.name}</h4><p className="text-sm text-[#667085]">{item.content} · {item.sku || "Sin SKU"}</p><p className="mt-2 text-xs leading-5 text-[#98a2b3]">{item.reasons.join(" · ")}</p>{item.candidate && <p className="mt-2 text-xs text-[#667085]">Fuente: {item.candidate.sourceDomain}</p>}</div>
        </article>)}</div>}
      </section>}
      <ConfirmDialog state={confirm} />
    </div>
  );
}
