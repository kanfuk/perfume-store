"use client";

import Link from "next/link";
import { Archive, ChevronLeft, DatabaseBackup, HardDrive, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { useAppFeedback } from "@/hooks/useAppFeedback";
import { appInfo } from "@/lib/app-info";
import { CATALOG_RESET_CONFIRMATION, ORPHAN_CLEANUP_CONFIRMATION, QA_CLEANUP_CONFIRMATION } from "@/lib/mvp-maintenance";

type QaPreview = { orders?: { deletable?: number }; customers?: { deletable?: number; manualReview?: number }; products?: { deletable?: number; manualReview?: number }; payments?: number; debts?: number; storageFiles?: number; warnings?: string[] };
type ResetPreview = { eliminable?: number; archivable?: number; blocked?: number; totalProducts?: number; historicalOrders?: number; historicalItems?: number; fingerprint?: string; canExecute?: boolean; message?: string };
type OrphanPreview = { bucket?: string; prefix?: string; storedCount?: number; referencedCount?: number; invalidCount?: number; outsidePrefixCount?: number; qaExcludedCount?: number; orphanPaths?: string[] };

async function readJson<T>(response: Response): Promise<T> {
  const value = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(value.error ?? "No fue posible completar la solicitud.");
  return value;
}

function idempotencyKey(action: string) {
  return `${action}:${crypto.randomUUID()}`;
}

export function MaintenancePanel() {
  const feedback = useAppFeedback();
  const [qa, setQa] = useState<QaPreview | null>(null);
  const [reset, setReset] = useState<ResetPreview | null>(null);
  const [orphans, setOrphans] = useState<OrphanPreview | null>(null);
  const [qaPhrase, setQaPhrase] = useState("");
  const [resetPhrase, setResetPhrase] = useState("");
  const [orphanPhrase, setOrphanPhrase] = useState("");
  const [backupDownloaded, setBackupDownloaded] = useState(false);
  const [backupAvailable, setBackupAvailable] = useState(false);
  const [busy, setBusy] = useState("");

  async function loadPreview(kind: "qa" | "reset" | "orphans") {
    const endpoints = { qa: "/api/admin/maintenance/qa-preview", reset: "/api/admin/maintenance/catalog-reset-preview", orphans: "/api/admin/maintenance/storage-orphans" };
    try {
      setBusy(kind);
      const response = await fetch(endpoints[kind], { cache: "no-store" });
      if (kind === "qa") setQa(await readJson<QaPreview>(response));
      if (kind === "reset") setReset(await readJson<ResetPreview>(response));
      if (kind === "orphans") setOrphans(await readJson<OrphanPreview>(response));
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "No fue posible generar la vista previa.");
    } finally { setBusy(""); }
  }

  async function downloadBackup(format: "json" | "csv") {
    try {
      setBusy(`backup-${format}`);
      const response = await fetch(`/api/admin/maintenance/catalog-backup?format=${format}`, { cache: "no-store" });
      if (!response.ok) throw new Error(((await response.json()) as { error?: string }).error ?? "No fue posible descargar el respaldo.");
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? `smellme-catalog.${format}`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
      setBackupAvailable(true);
      feedback.success(`Respaldo ${format.toUpperCase()} descargado.`);
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "No fue posible descargar el respaldo.");
    } finally { setBusy(""); }
  }

  async function mutate(kind: "qa" | "reset" | "orphans") {
    const config = {
      qa: { endpoint: "/api/admin/maintenance/qa-cleanup", phrase: qaPhrase, expected: QA_CLEANUP_CONFIRMATION, title: "Eliminar datos QA inequívocos" },
      reset: { endpoint: "/api/admin/maintenance/catalog-reset", phrase: resetPhrase, expected: CATALOG_RESET_CONFIRMATION, title: "Reiniciar catálogo" },
      orphans: { endpoint: "/api/admin/maintenance/storage-orphans/cleanup", phrase: orphanPhrase, expected: ORPHAN_CLEANUP_CONFIRMATION, title: "Eliminar archivos huérfanos" }
    }[kind];
    if (config.phrase !== config.expected) return;
    const confirmed = await feedback.confirm({ title: config.title, description: "La operación recalculará la vista previa en el servidor y solo actuará sobre registros clasificados como seguros.", confirmLabel: "Confirmar operación", cancelLabel: "Cancelar", tone: "danger" });
    if (!confirmed) return;
    try {
      setBusy(`${kind}-mutation`);
      const body: Record<string, unknown> = { confirmation: config.phrase, idempotencyKey: idempotencyKey(kind) };
      if (kind === "reset") { body.backupConfirmed = backupDownloaded; body.expectedFingerprint = reset?.fingerprint; }
      await readJson<Record<string, unknown>>(await fetch(config.endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
      feedback.success("Operación de mantenimiento completada y registrada.");
      await loadPreview(kind);
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "No fue posible completar la operación.");
    } finally { setBusy(""); }
  }

  return (
    <main className="min-h-screen bg-[#f7f8fa] px-4 py-6 text-[#17191f] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-[26px] bg-[#17191f] p-5 text-white shadow-soft sm:p-7">
          <Link href="/admin" className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-white/15 px-4 py-2 text-sm font-semibold text-white/85"><ChevronLeft className="h-4 w-4" />Centro de control</Link>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-2xl font-bold sm:text-3xl">Mantenimiento seguro</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">Previsualiza, respalda y confirma por texto. Abrir esta página nunca modifica datos.</p></div><span className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold">Smellme {appInfo.version}</span></div>
        </header>

        <MaintenanceCard icon={<ShieldCheck className="h-5 w-5" />} title="Datos de prueba QA" description="Solo acepta evidencia explícita: ZZTEST, harness example.com, nombres QA documentados, idempotencia QA o IDs registrados.">
          <button className="inline-flex min-h-11 rounded-[18px] border border-[#d0d5dd] px-4 py-3 text-sm font-semibold disabled:opacity-50" disabled={Boolean(busy)} onClick={() => void loadPreview("qa")}>{busy === "qa" ? "Analizando…" : "Generar vista previa QA"}</button>
          {qa ? <Summary rows={[["Pedidos eliminables", qa.orders?.deletable], ["Clientes eliminables", qa.customers?.deletable], ["Clientes para revisión", qa.customers?.manualReview], ["Productos eliminables", qa.products?.deletable], ["Productos para revisión", qa.products?.manualReview], ["Pagos / fiados", `${qa.payments ?? 0} / ${qa.debts ?? 0}`], ["Archivos QA", qa.storageFiles]]} /> : null}
          <ConfirmControls phrase={qaPhrase} setPhrase={setQaPhrase} expected={QA_CLEANUP_CONFIRMATION} disabled={!qa || Boolean(busy)} onConfirm={() => void mutate("qa")} />
        </MaintenanceCard>

        <MaintenanceCard icon={<DatabaseBackup className="h-5 w-5" />} title="Respaldo del catálogo" description="Exporta productos, precios, costos, stock, visibilidad e imágenes. No incluye clientes, pagos, datos bancarios ni información personal.">
          <div className="flex flex-wrap gap-3"><button className="inline-flex min-h-11 rounded-[18px] border border-[#d0d5dd] px-4 py-3 text-sm font-semibold disabled:opacity-50" disabled={Boolean(busy)} onClick={() => void downloadBackup("json")}>Descargar JSON</button><button className="inline-flex min-h-11 rounded-[18px] border border-[#d0d5dd] px-4 py-3 text-sm font-semibold disabled:opacity-50" disabled={Boolean(busy)} onClick={() => void downloadBackup("csv")}>Descargar CSV</button></div>
          <label className="mt-4 flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 h-4 w-4" checked={backupDownloaded} disabled={!backupAvailable} onChange={(event) => setBackupDownloaded(event.target.checked)} />Confirmo que descargué y guardé un respaldo válido del catálogo.</label>
        </MaintenanceCard>

        <MaintenanceCard icon={<Archive className="h-5 w-5" />} title="Reinicio seguro del catálogo" description="ELIMINABLE no tiene historial; ARCHIVABLE conserva su fila pausada y los snapshots; BLOQUEADO tiene reservas o pedidos abiertos e impide toda ejecución.">
          <button className="inline-flex min-h-11 rounded-[18px] border border-[#d0d5dd] px-4 py-3 text-sm font-semibold disabled:opacity-50" disabled={Boolean(busy)} onClick={() => void loadPreview("reset")}>{busy === "reset" ? "Clasificando…" : "Clasificar catálogo"}</button>
          {reset ? <><Summary rows={[["Eliminables", reset.eliminable], ["Archivables", reset.archivable], ["Bloqueados", reset.blocked], ["Pedidos históricos", reset.historicalOrders], ["Items históricos", reset.historicalItems]]} /><p className="mt-3 text-sm text-[#667085]">{reset.message}</p></> : null}
          <ConfirmControls phrase={resetPhrase} setPhrase={setResetPhrase} expected={CATALOG_RESET_CONFIRMATION} disabled={!reset?.canExecute || !backupDownloaded || Boolean(busy)} onConfirm={() => void mutate("reset")} />
        </MaintenanceCard>

        <MaintenanceCard icon={<HardDrive className="h-5 w-5" />} title="Archivos huérfanos" description="Analiza exclusivamente product-images/products/. Nunca acepta rutas enviadas por el navegador.">
          <button className="inline-flex min-h-11 rounded-[18px] border border-[#d0d5dd] px-4 py-3 text-sm font-semibold disabled:opacity-50" disabled={Boolean(busy)} onClick={() => void loadPreview("orphans")}>{busy === "orphans" ? "Inventariando…" : "Analizar Storage"}</button>
          {orphans ? <Summary rows={[["Archivos almacenados", orphans.storedCount], ["Rutas referenciadas", orphans.referencedCount], ["Huérfanos seguros", orphans.orphanPaths?.length], ["QA excluidos", orphans.qaExcludedCount], ["Inválidos", orphans.invalidCount], ["Fuera de prefijo", orphans.outsidePrefixCount]]} /> : null}
          <ConfirmControls phrase={orphanPhrase} setPhrase={setOrphanPhrase} expected={ORPHAN_CLEANUP_CONFIRMATION} disabled={!orphans || Boolean(busy)} onConfirm={() => void mutate("orphans")} />
        </MaintenanceCard>
      </div>
    </main>
  );
}

function MaintenanceCard({ icon, title, description, children }: { icon: React.ReactNode; title: string; description: string; children: React.ReactNode }) {
  return <section className="rounded-[24px] border border-[#e4e7ec] bg-white p-5 shadow-soft sm:p-7"><div className="flex items-center gap-3"><span className="rounded-xl bg-[#f2f4f7] p-2">{icon}</span><h2 className="text-xl font-bold">{title}</h2></div><p className="mt-3 max-w-4xl text-sm leading-6 text-[#667085]">{description}</p><div className="mt-5">{children}</div></section>;
}

function Summary({ rows }: { rows: Array<[string, unknown]> }) {
  return <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{rows.map(([label, value]) => <div key={label} className="rounded-2xl bg-[#f7f8fa] p-4"><dt className="text-xs font-semibold uppercase tracking-wide text-[#667085]">{label}</dt><dd className="mt-1 text-xl font-bold">{String(value ?? 0)}</dd></div>)}</dl>;
}

function ConfirmControls({ phrase, setPhrase, expected, disabled, onConfirm }: { phrase: string; setPhrase: (value: string) => void; expected: string; disabled: boolean; onConfirm: () => void }) {
  return <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4"><label className="block text-sm font-semibold text-rose-950">Escribe exactamente: <code>{expected}</code><input value={phrase} onChange={(event) => setPhrase(event.target.value)} autoComplete="off" className="mt-3 min-h-11 w-full rounded-xl border border-rose-200 bg-white px-3 text-sm" /></label><button type="button" disabled={disabled || phrase !== expected} onClick={onConfirm} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-[18px] bg-rose-700 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-rose-300"><Trash2 className="h-4 w-4" />Ejecutar operación confirmada</button></div>;
}
