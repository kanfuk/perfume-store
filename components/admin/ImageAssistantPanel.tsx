"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Images, Pause, Play, Search, ShieldCheck, Upload } from "lucide-react";
import { ConfirmDialog, type ConfirmDialogState } from "@/components/ui/ConfirmDialog";
import type { ImageAssistantAnalysis, ImageAssistantDryRunEntry, ImageAssistantHealth, ImageAssistantItem } from "@/lib/image-assistant/types";

type AnalysisResponse = {
  analysis: ImageAssistantAnalysis;
  csvFingerprint: string;
  health: ImageAssistantHealth;
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
  const [health, setHealth] = useState<ImageAssistantHealth | null>(null);
  const [items, setItems] = useState<ImageAssistantItem[]>([]);
  const [runState, setRunState] = useState<RunState>("IDLE");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [report, setReport] = useState<ReportEntry[]>([]);
  const [confirm, setConfirm] = useState<ConfirmDialogState>(null);
  const [showPending, setShowPending] = useState(false);
  const stopRef = useRef(false);

  useEffect(() => {
    void fetch("/api/admin/image-assistant/health", { cache: "no-store" })
      .then(readJson)
      .then((next: ImageAssistantHealth) => setHealth(next))
      .catch(() => setHealth(null));
  }, []);

  const summary = useMemo(() => {
    const count = (status: ImageAssistantItem["status"]) => items.filter((item) => item.status === status).length;
    return {
      total: items.length,
      withoutImage: items.filter((item) => item.status !== "YA_TIENE_IMAGEN").length,
      safe: count("AUTO_SEGURO"),
      review: count("REQUIERE_REVISION"),
      noSource: count("SIN_FUENTE_SEGURA"),
      noProvider: count("PROVEEDOR_NO_CONFIGURADO"),
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
      setHealth(data.health);
      setItems(data.analysis.items);
      setReport([]);
      setRunState("IDLE");
      setMessage(data.health.providerConfigured && data.health.searchEnabled
        ? "Análisis listo. El dry-run buscará candidatos sin descargar ni subir imágenes."
        : "Análisis listo. Proveedor no configurado o búsqueda deshabilitada; no se buscarán ni subirán imágenes.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No fue posible analizar."); setMessage(""); }
  }

  function updateItem(next: ImageAssistantItem) {
    setItems((current) => current.map((item) => item.productId === next.productId ? next : item));
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

  async function executeDryRun() {
    if (!response) return;
    setError("");
    setMessage("Ejecutando búsqueda dry-run; no se descargarán imágenes completas ni se escribirá en Storage o DB…");
    setRunState("SEARCHING");
    try {
      const data = await readJson(await fetch("/api/admin/image-assistant/dry-run", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload())
      })) as { entries: ImageAssistantDryRunEntry[]; csvFingerprint: string };
      const byId = new Map(data.entries.map((entry) => [entry.productId, entry]));
      setItems((current) => current.map((item) => {
        const entry = byId.get(item.productId);
        return entry ? { ...item, status: entry.status, score: entry.score, reasons: entry.reasons } : item;
      }));
      const json = JSON.stringify({ generatedAt: new Date().toISOString(), csvFingerprint: data.csvFingerprint, entries: data.entries }, null, 2);
      const csvRows = [
        ["productId", "status", "score", "domain", "reasons", "contradictions", "candidateCount", "recommendedCandidate"],
        ...data.entries.map((entry) => [entry.productId, entry.status, entry.score ?? "", entry.domain ?? "", entry.reasons.join("|"), entry.contradictions, entry.candidateCount, entry.recommendedCandidate?.sourcePageUrl ?? ""])
      ];
      const csv = csvRows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
      for (const [name, contents, type] of [
        ["image-assistant-dry-run.json", json, "application/json"],
        ["image-assistant-dry-run.csv", csv, "text/csv"]
      ] as const) {
        const url = URL.createObjectURL(new Blob([contents], { type }));
        const link = document.createElement("a"); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url);
      }
      setMessage(`Dry-run terminado: ${data.entries.length} productos buscados, 0 imágenes subidas.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible ejecutar el dry-run.");
      setMessage("");
    } finally { setRunState("IDLE"); }
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
  const visibleItems = showPending ? items.filter((item) => ["REQUIERE_REVISION", "SIN_FUENTE_SEGURA", "PROVEEDOR_NO_CONFIGURADO", "ERROR"].includes(item.status)) : items.filter((item) => item.status === "AUTO_SEGURO");
  const configurationReady = Boolean(health?.providerConfigured && health.signingSecretConfigured && health.allowedDomainsConfigured && health.searchEnabled);
  const processingApproved = Boolean(configurationReady && health?.batchEnabled && response?.analysis.batchAllowedByAuditReconciliation && response.analysis.reconciliationApproved);

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

      <section className="rounded-2xl border border-[#e4e7ec] bg-white p-5 shadow-sm">
        <h3 className="font-semibold text-[#111318]">Configuración segura</h3>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
          {[
            ["Proveedor de búsqueda", health?.providerConfigured, "Configurado", "No configurado"],
            ["Firma", health?.signingSecretConfigured, "Configurada", "No configurada"],
            ["Dominios", health?.allowedDomainsConfigured, "Configurados", "No configurados"],
            ["Búsqueda", health?.searchEnabled, "Habilitada", "Deshabilitada"],
            ["Carga automática", health?.batchEnabled, "Habilitada", "Deshabilitada"]
          ].map(([label, enabled, yes, no]) => <div key={String(label)}><dt className="text-[#667085]">{label}</dt><dd className={`mt-1 font-semibold ${enabled ? "text-emerald-700" : "text-amber-700"}`}>{enabled ? yes : no}</dd></div>)}
        </dl>
        <p className="mt-3 text-xs text-[#98a2b3]">Este panel sólo muestra estados booleanos; nunca expone credenciales ni dominios configurados.</p>
      </section>

      {items.length > 0 && <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {[ ["Sin imagen", summary.withoutImage], ["Seguras", summary.safe], ["Revisión", summary.review], ["Sin fuente", summary.noSource], ["Proveedor no configurado", summary.noProvider], ["Con imagen", summary.existing], ["Excluidos", summary.excluded] ].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-[#e4e7ec] bg-white p-4"><p className="text-xs text-[#667085]">{label}</p><p className="mt-1 text-2xl font-bold text-[#111318]">{value}</p></div>)}
      </section>}

      <section className="flex flex-wrap gap-2 rounded-2xl border border-[#e4e7ec] bg-white p-4">
        <button disabled={!file || busy} onClick={() => void analyze()} className={`${buttonClass} bg-[#7357ff] text-white`}><Search className="h-4 w-4" />Analizar catálogo</button>
        <a href="/api/admin/image-assistant/reconciliation" target="_blank" rel="noreferrer" className={`${buttonClass} border border-[#d0d5dd] bg-white text-[#344054]`}>Ver reconciliación de 39 casos</a>
        <button disabled={!response || busy || !configurationReady} onClick={() => void executeDryRun()} className={`${buttonClass} border border-[#7357ff] bg-white text-[#5434e6]`}><Images className="h-4 w-4" />Ejecutar dry-run</button>
        <button disabled={!processingApproved || summary.safe === 0 || busy} onClick={requestProcessing} className={`${buttonClass} bg-[#111318] text-white`}><ShieldCheck className="h-4 w-4" />Procesar coincidencias seguras</button>
        <button disabled={!processingApproved || summary.safe === 0 || busy} onClick={requestProcessing} className={`${buttonClass} bg-[#111318] text-white`}><Play className="h-4 w-4" />Iniciar canary</button>
        <button disabled={!response || busy} onClick={() => setShowPending(true)} className={`${buttonClass} border border-[#d0d5dd] bg-white text-[#344054]`}>Revisar pendientes</button>
        <button disabled={!response} onClick={downloadReport} className={`${buttonClass} border border-[#d0d5dd] bg-white text-[#344054]`}><Download className="h-4 w-4" />Descargar informe</button>
        {busy && <button onClick={() => { stopRef.current = true; }} className={`${buttonClass} bg-amber-100 text-amber-900`}><Pause className="h-4 w-4" />Detener</button>}
        {runState === "CANARY_REVIEW" && <button onClick={continueAfterCanary} className={`${buttonClass} bg-emerald-600 text-white`}><Play className="h-4 w-4" />Continuar lote</button>}
      </section>

      {(message || error) && <div role="status" className={`rounded-xl border p-4 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{error || message}</div>}

      {response && <section className="space-y-3">
        <div className="flex items-center justify-between"><h3 className="font-semibold text-[#111318]">{showPending ? "Pendientes manuales" : "Vista previa segura"}</h3>{showPending && <button className="text-sm font-semibold text-[#5434e6]" onClick={() => setShowPending(false)}>Ver coincidencias seguras</button>}</div>
        {visibleItems.length === 0 ? <p className="rounded-xl border border-[#e4e7ec] bg-white p-5 text-sm text-[#667085]">No hay productos en esta bandeja.</p> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{visibleItems.map((item) => <article key={item.productId} className="overflow-hidden rounded-xl border border-[#e4e7ec] bg-white">
          <div className="p-4"><p className="text-xs font-semibold text-[#7357ff]">{item.status}{item.score ? ` · ${item.score}/100` : ""}</p><h4 className="mt-1 font-semibold text-[#111318]">{item.brand} {item.name}</h4><p className="text-sm text-[#667085]">{item.content} · {item.sku || "Sin SKU"}</p><p className="mt-2 text-xs leading-5 text-[#98a2b3]">{item.reasons.join(" · ")}</p>{item.candidate && <p className="mt-2 text-xs text-[#667085]">Fuente: {item.candidate.sourceDomain}</p>}</div>
        </article>)}</div>}
      </section>}
      <ConfirmDialog state={confirm} />
    </div>
  );
}
