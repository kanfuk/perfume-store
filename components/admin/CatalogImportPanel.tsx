"use client";

import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Home, ShoppingBag, UploadCloud } from "lucide-react";
import Link from "next/link";
import { formatCurrency } from "@/lib/format";

type PlanAction = "CREAR" | "ACTUALIZAR" | "BLOQUEADO";

type PlanRow = {
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

type RowError = { rowNumber: number; sku: string; message: string };

type Preview = {
  totalFilas: number;
  filasValidas: unknown[];
  erroresFila: RowError[];
  plan: PlanRow[];
  resumen: { crear: number; actualizar: number; bloqueado: number };
  erroresGlobales: string[];
};

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

export function CatalogImportPanel() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [fileBase64, setFileBase64] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [confirmResult, setConfirmResult] = useState<{ creados: number; actualizados: number } | null>(null);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setPreview(null);
    setConfirmResult(null);
    setError("");

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

  async function requestPreview() {
    if (!fileBase64 || !fileName) {
      setError("Selecciona un archivo CSV primero.");
      return;
    }

    setLoading(true);
    setError("");
    setConfirmResult(null);

    try {
      const response = await fetch("/api/admin/products/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview", fileName, fileBase64 })
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "No fue posible previsualizar el archivo.");
        setPreview(data.preview ?? null);
        return;
      }

      setPreview(data.preview);
    } catch {
      setError("No fue posible conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  }

  async function confirmImport() {
    if (!fileBase64 || !fileName || !preview) return;

    setConfirming(true);
    setError("");

    try {
      const response = await fetch("/api/admin/products/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm", fileName, fileBase64 })
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "No fue posible confirmar la importación.");
        return;
      }

      setConfirmResult({ creados: data.creados, actualizados: data.actualizados });
      setPreview(data.preview);
    } catch {
      setError("No fue posible conectar con el servidor.");
    } finally {
      setConfirming(false);
    }
  }

  const canConfirm =
    !!preview &&
    preview.erroresGlobales.length === 0 &&
    preview.plan.length > 0 &&
    !confirmResult;

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
                Sube un CSV con el catálogo (sku, nombre, marca, contenido, costo_unitario,
                precio_venta, stock, activo, es_top, orden_destacado, es_oferta_semana,
                precio_anterior, image_url). Primero se genera una vista previa; nada se
                guarda hasta que confirmes.
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            aria-label="Seleccionar archivo CSV"
            className="block w-full flex-1 rounded-xl border border-[#e4e7ec] bg-[#f7f8fa] px-3 py-2.5 text-sm text-[#344054]"
          />
          <button
            type="button"
            onClick={requestPreview}
            disabled={!fileBase64 || loading}
            className="app-button-primary inline-flex min-h-12 items-center justify-center gap-2 px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            <UploadCloud className="h-4 w-4" />
            {loading ? "Analizando..." : "Vista previa"}
          </button>
        </div>

        {error ? (
          <div className="flex items-start gap-2 rounded-xl border border-[#f3c6c0] bg-[#fdf1ef] px-4 py-3 text-sm text-[#8a2c22]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {confirmResult ? (
          <div className="flex items-start gap-2 rounded-xl border border-[#bfe6c6] bg-[#eefbf1] px-4 py-3 text-sm text-[#1f6d33]">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Importación aplicada: {confirmResult.creados} creados, {confirmResult.actualizados}{" "}
              actualizados.
            </span>
          </div>
        ) : null}

        {preview ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SummaryTile label="Crear" value={preview.resumen.crear} tone="create" />
              <SummaryTile label="Actualizar" value={preview.resumen.actualizar} tone="update" />
              <SummaryTile label="Bloqueados" value={preview.resumen.bloqueado} tone="block" />
              <SummaryTile label="Filas totales" value={preview.totalFilas} tone="neutral" />
            </div>

            {preview.erroresGlobales.length > 0 ? (
              <div className="space-y-1 rounded-xl border border-[#f3c6c0] bg-[#fdf1ef] px-4 py-3 text-sm text-[#8a2c22]">
                <p className="font-semibold">No se puede confirmar mientras existan estos errores:</p>
                <ul className="list-disc space-y-0.5 pl-5">
                  {preview.erroresGlobales.map((message, index) => (
                    <li key={index}>{message}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {preview.plan.length > 0 ? (
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
                    {preview.plan.map((item) => (
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
            ) : null}

            {preview.erroresFila.length > 0 ? (
              <div className="space-y-2 rounded-xl border border-[#fbe3b0] bg-[#fff8ec] px-4 py-3 text-sm text-[#8a5a00]">
                <p className="font-semibold">Filas bloqueadas ({preview.erroresFila.length}):</p>
                <ul className="max-h-48 list-disc space-y-1 overflow-y-auto pl-5">
                  {preview.erroresFila.map((rowError, index) => (
                    <li key={index}>
                      Fila {rowError.rowNumber} ({rowError.sku || "sin SKU"}): {rowError.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={confirmImport}
                disabled={!canConfirm || confirming}
                className="app-button-primary inline-flex min-h-12 items-center justify-center gap-2 px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              >
                {confirming ? "Aplicando..." : "Confirmar importación"}
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </main>
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
