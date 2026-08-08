"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, ChevronLeft } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { groupByFamilyKey } from "@/lib/product-families";
import type { FinalPlanRow, QualityReviewSummary } from "@/lib/catalog-import/quality-review.ts";

type Props = {
  plan: FinalPlanRow[];
  summary: QualityReviewSummary;
  busy: boolean;
  onBack: () => void;
  onConfirm: () => void;
};

export function CatalogImportFinalSummary({ plan, summary, busy, onBack, onConfirm }: Props) {
  const [expanded, setExpanded] = useState(false);

  const nuevos = plan.filter((p) => p.action === "CREAR").length;
  const actualizar = plan.filter((p) => p.action === "ACTUALIZAR").length;
  const filasOriginales = summary.filasUtiles;
  const filasFinales = plan.reduce((acc, p) => acc + p.rowNumbers.length, 0);
  const filasExcluidas = Math.max(filasOriginales - filasFinales, 0);
  const familiasConVariantes = groupByFamilyKey(plan).filter((group) => group.items.length > 1);

  // Seccion 11 (Fase 2B.13): productos con nombre/marca/contenido corregidos
  // durante la revision guiada (venian vacios o con formato no estandar).
  const corregidos = plan.filter((p) => p.corrections && p.corrections.length > 0);
  const completos = plan.length - corregidos.length;
  const FIELD_LABELS: Record<string, string> = { nombre: "Nombre", marca: "Marca", contenido: "Contenido" };

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        disabled={busy}
        className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-[#8A6036] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ChevronLeft className="h-4 w-4" /> Volver a la revisión
      </button>

      <div className="rounded-2xl border border-[#bfe6c6] bg-[#eefbf1] p-4">
        <h2 className="text-lg font-bold text-[#1f6d33]">Catálogo listo para importar</h2>
        <p className="text-sm text-[#1f6d33]/80">
          Se aplicaron todas las decisiones. El SKU final se generó después de resolver los conflictos.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SummaryTile label="Productos completos" value={completos} />
        <SummaryTile label="Corregidos en la revisión" value={corregidos.length} />
        <SummaryTile label="Bloqueos resueltos" value={summary.conflictosPendientes} />
        <SummaryTile label="No se publicarán (excluidos)" value={filasExcluidas} />
        <SummaryTile label="Filas originales" value={filasOriginales} />
        <SummaryTile label="Filas finales" value={filasFinales} />
        <SummaryTile label="Productos nuevos" value={nuevos} />
        <SummaryTile label="Productos a actualizar" value={actualizar} />
        <SummaryTile label="Variantes" value={summary.variantesDetectadas} />
        <SummaryTile label="Nombres/marcas normalizados" value={summary.normalizacionesSeguras + summary.incoherenciasNombreOMarca} />
        <SummaryTile label="Duplicados resueltos" value={summary.posiblesDuplicados} />
      </div>

      {corregidos.length > 0 ? (
        <div className="space-y-2 rounded-xl border border-[#d8cdfe] bg-[#f5f2ff] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#B88B58]">
            Productos corregidos durante la revisión
          </p>
          <div className="space-y-2">
            {corregidos.map((row) => (
              <div key={row.sku} className="rounded-lg border border-[#DDD0C1] bg-white p-3 text-sm">
                <p className="font-semibold text-[#191714]">
                  {row.nombre} · {row.marca} · {row.contenido}
                </p>
                <div className="mt-1 grid gap-1 sm:grid-cols-2">
                  {row.corrections!.map((correction, index) => (
                    <div key={`${row.sku}-${correction.field}-${index}`} className="text-xs text-[#6B6258]">
                      <span className="font-semibold text-[#4D453D]">{FIELD_LABELS[correction.field]}:</span>{" "}
                      <span className="text-[#b44b43] line-through">{correction.before || "vacío"}</span>
                      {" → "}
                      <span className="font-semibold text-[#1f6d33]">{correction.after}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <p className="text-xs text-[#6B6258]">
        Precio de venta calculado con el recargo vigente (salvo productos con precio manual, que se preservan).
        Stock inicial para productos nuevos: 1.
      </p>

      {familiasConVariantes.length > 0 ? (
        <div className="space-y-2 rounded-xl border border-[#DDD0C1] bg-[#F7F1E8] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#8C8175]">Variantes agrupadas</p>
          {familiasConVariantes.map((family) => (
            <div key={family.key} className="text-sm">
              <span className="font-semibold text-[#191714]">{family.nombre}</span>
              <span className="ml-2 text-[#6B6258]">
                {family.items.length} presentaciones: {family.items.map((r) => r.contenido).join(", ")}
              </span>
              <p className="text-xs text-[#6B6258]">
                Se crearán {family.items.length} productos internos y una sola tarjeta en el catálogo público.
              </p>
            </div>
          ))}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-[#8A6036]"
      >
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />} Ver cambios
      </button>

      {expanded ? (
        <div className="overflow-x-auto rounded-xl border border-[#DDD0C1]">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-[#F7F1E8] text-xs font-semibold uppercase tracking-wide text-[#6B6258]">
              <tr>
                <th className="px-3 py-2">Filas origen</th>
                <th className="px-3 py-2">Después</th>
                <th className="px-3 py-2">Acción final</th>
                <th className="px-3 py-2">SKU final</th>
                <th className="px-3 py-2">Costo</th>
                <th className="px-3 py-2">Precio calculado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eef0f3]">
              {plan.map((row) => (
                <tr key={row.sku}>
                  <td className="px-3 py-2 text-[#6B6258]">{row.rowNumbers.join(", ")}</td>
                  <td className="px-3 py-2 text-[#191714]">
                    {row.nombre} · {row.marca} · {row.contenido}
                  </td>
                  <td className="px-3 py-2 text-[#6B6258]">{row.action}</td>
                  <td className="px-3 py-2 font-mono text-xs text-[#4D453D]">{row.sku}</td>
                  <td className="px-3 py-2 text-[#191714]">{formatCurrency(row.costoUnitario)}</td>
                  <td className="px-3 py-2 text-[#191714]">
                    {formatCurrency(row.precioVentaFinal)}
                    {row.modoPrecio === "MANUAL" ? (
                      <span className="ml-1 rounded-full bg-[#fff3c4] px-1.5 py-0.5 text-[10px] font-semibold text-[#8a5a00]">
                        MANUAL
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="app-button-primary inline-flex min-h-12 items-center justify-center gap-2 px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" /> : null}
          Confirmar importación
        </button>
      </div>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-[#F7F1E8] px-3 py-2 text-[#4D453D]">
      <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  );
}
