"use client";

import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  ChevronLeft,
  Info,
  ShieldAlert
} from "lucide-react";
import { formatCurrency } from "@/lib/format";
import type {
  QualityDecision,
  QualityFinding,
  QualityFindingType,
  QualityReviewSummary
} from "@/lib/catalog-import/quality-review.ts";

type TabId = "pendientes" | "duplicados" | "variantes" | "nombres" | "costos" | "resueltos";

const TABS: { id: TabId; label: string }[] = [
  { id: "pendientes", label: "Pendientes" },
  { id: "duplicados", label: "Duplicados" },
  { id: "variantes", label: "Variantes" },
  { id: "nombres", label: "Nombres y marcas" },
  { id: "costos", label: "Costos" },
  { id: "resueltos", label: "Resueltos" }
];

const TYPE_LABELS: Record<QualityFindingType, string> = {
  SAFE_NORMALIZATION: "Normalización segura",
  EXACT_DUPLICATE: "Duplicado exacto",
  POSSIBLE_DUPLICATE: "Posible duplicado",
  VARIANT: "Variante por contenido",
  BRAND_INCONSISTENCY: "Marca inconsistente",
  NAME_INCONSISTENCY: "Posible inconsistencia de nombre",
  EXISTING_CATALOG_MATCH: "Posible producto existente",
  PRICE_ANOMALY: "Advertencia de costo"
};

function requiresDecision(finding: QualityFinding): boolean {
  return finding.severity !== "INFO";
}

function tabsForFinding(finding: QualityFinding): TabId[] {
  const tabs: TabId[] = [];
  if (finding.type === "EXACT_DUPLICATE" || finding.type === "POSSIBLE_DUPLICATE") tabs.push("duplicados");
  if (finding.type === "VARIANT") tabs.push("variantes");
  if (
    finding.type === "BRAND_INCONSISTENCY" ||
    finding.type === "NAME_INCONSISTENCY" ||
    finding.type === "EXISTING_CATALOG_MATCH"
  ) {
    tabs.push("nombres");
  }
  if (finding.type === "PRICE_ANOMALY") tabs.push("costos");
  return tabs;
}

function severityChip(severity: QualityFinding["severity"]) {
  if (severity === "BLOCKER") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#fdf1ef] px-2.5 py-0.5 text-xs font-semibold text-[#8a2c22]">
        <ShieldAlert className="h-3 w-3" /> Bloqueante
      </span>
    );
  }
  if (severity === "WARNING") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#fff3c4] px-2.5 py-0.5 text-xs font-semibold text-[#8a5a00]">
        <AlertTriangle className="h-3 w-3" /> Advertencia
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#eeebff] px-2.5 py-0.5 text-xs font-semibold text-[#5434e6]">
      <Info className="h-3 w-3" /> Informativo
    </span>
  );
}

type Props = {
  findings: QualityFinding[];
  summary: QualityReviewSummary;
  busy: boolean;
  decisions: Record<string, QualityDecision>;
  onDecisionsChange: (decisions: Record<string, QualityDecision>) => void;
  onBack: () => void;
  onContinue: (decisions: QualityDecision[]) => void;
};

export function CatalogQualityReview({
  findings,
  summary,
  busy,
  decisions,
  onDecisionsChange,
  onBack,
  onContinue
}: Props) {
  const [safeAcknowledged, setSafeAcknowledged] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("pendientes");
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const pendingFindings = useMemo(
    () => findings.filter((f) => requiresDecision(f) && !decisions[f.id]),
    [findings, decisions]
  );
  const blockerFindings = useMemo(() => findings.filter((f) => f.severity === "BLOCKER"), [findings]);
  const unresolvedBlockers = useMemo(
    () => blockerFindings.filter((f) => !decisions[f.id]),
    [blockerFindings, decisions]
  );

  const [focusIndex, setFocusIndex] = useState(0);
  const focusedFinding = pendingFindings[Math.min(focusIndex, Math.max(pendingFindings.length - 1, 0))];

  function scrollToFinding(id: string | undefined) {
    if (!id) return;
    cardRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function goToStep(delta: number) {
    const next = Math.max(0, Math.min(pendingFindings.length - 1, focusIndex + delta));
    setFocusIndex(next);
    scrollToFinding(pendingFindings[next]?.id);
  }

  function applyDecision(finding: QualityFinding, decision: QualityDecision) {
    onDecisionsChange({ ...decisions, [finding.id]: decision });
  }

  function clearDecision(finding: QualityFinding) {
    const next = { ...decisions };
    delete next[finding.id];
    onDecisionsChange(next);
  }

  const visibleFindings = useMemo(() => {
    if (activeTab === "pendientes") return findings.filter((f) => requiresDecision(f) && !decisions[f.id]);
    if (activeTab === "resueltos") {
      return findings.filter((f) => decisions[f.id] || f.type === "SAFE_NORMALIZATION" || f.type === "VARIANT");
    }
    return findings.filter((f) => tabsForFinding(f).includes(activeTab));
  }, [findings, activeTab, decisions]);

  const safeNormalizations = findings.filter((f) => f.type === "SAFE_NORMALIZATION");

  function acceptAllSafeNormalizations() {
    setSafeAcknowledged(true);
  }

  const canContinue = unresolvedBlockers.length === 0;

  function handleContinue() {
    if (!canContinue) return;
    onContinue(Object.values(decisions));
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <button
          type="button"
          onClick={onBack}
          disabled={busy}
          className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-[#5434e6] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ChevronLeft className="h-4 w-4" /> Volver a la vista previa
        </button>
        <h2 className="text-xl font-bold text-[#111318]">Revisión del catálogo</h2>
        <p className="text-sm text-[#667085]">
          Revisamos nombres, variantes y posibles duplicados antes de importar.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
        <SummaryStat label="Filas útiles" value={summary.filasUtiles} />
        <SummaryStat label="Normalizaciones" value={summary.normalizacionesSeguras} />
        <SummaryStat label="Variantes" value={summary.variantesDetectadas} />
        <SummaryStat label="Posibles duplicados" value={summary.posiblesDuplicados} />
        <SummaryStat label="Con catálogo existente" value={summary.coincidenciasCatalogoExistente} />
        <SummaryStat label="Nombres/marcas" value={summary.incoherenciasNombreOMarca} />
        <SummaryStat label="Costos" value={summary.advertenciasCosto} />
        <SummaryStat label="Conflictos pendientes" value={summary.conflictosPendientes} tone={summary.conflictosPendientes > 0 ? "block" : "ok"} />
      </div>

      {pendingFindings.length > 0 ? (
        <div className="rounded-xl border border-[#e4e7ec] bg-[#f7f8fa] px-4 py-2 text-sm font-medium text-[#344054]">
          Conflicto {Math.min(focusIndex + 1, pendingFindings.length)} de {pendingFindings.length}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-[#bfe6c6] bg-[#eefbf1] px-4 py-3 text-sm font-semibold text-[#1f6d33]">
          <CheckCircle2 className="h-4 w-4" /> Catálogo listo para importar
        </div>
      )}

      {safeNormalizations.length > 0 && !safeAcknowledged ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e4e7ec] bg-white px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-[#344054]">
            <BadgeCheck className="h-4 w-4 text-[#5434e6]" />
            {safeNormalizations.length} normalizaciones seguras se aplicaron automáticamente (espacios, capitalización,
            formato de contenido). No cambian el significado comercial.
          </div>
          <button
            type="button"
            onClick={acceptAllSafeNormalizations}
            className="min-h-11 shrink-0 rounded-lg border border-[#5434e6] px-3 py-2 text-xs font-semibold text-[#5434e6]"
          >
            Aceptar todas las normalizaciones seguras
          </button>
        </div>
      ) : null}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((tab) => {
          const count =
            tab.id === "pendientes"
              ? findings.filter((f) => requiresDecision(f) && !decisions[f.id]).length
              : tab.id === "resueltos"
                ? findings.filter((f) => decisions[f.id] || f.type === "SAFE_NORMALIZATION" || f.type === "VARIANT").length
                : findings.filter((f) => tabsForFinding(f).includes(tab.id)).length;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`min-h-11 shrink-0 rounded-full border px-4 py-2 text-xs font-semibold transition ${
                active
                  ? "border-[#5434e6] bg-[#5434e6] text-white"
                  : "border-[#e4e7ec] bg-white text-[#344054]"
              }`}
            >
              {tab.label} ({count})
            </button>
          );
        })}
      </div>

      <div className="space-y-3">
        {visibleFindings.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[#e4e7ec] px-4 py-6 text-center text-sm text-[#667085]">
            No hay hallazgos en esta categoría.
          </p>
        ) : (
          visibleFindings.map((finding) => (
            <div key={finding.id} ref={(el) => { cardRefs.current[finding.id] = el; }}>
              <FindingCard
                finding={finding}
                decision={decisions[finding.id]}
                focused={focusedFinding?.id === finding.id}
                onApply={(decision) => applyDecision(finding, decision)}
                onClear={() => clearDecision(finding)}
              />
            </div>
          ))
        )}
      </div>

      <div className="hidden items-center justify-between rounded-xl border border-[#e4e7ec] bg-white px-4 py-3 sm:flex">
        <p className="text-sm text-[#667085]">
          {canContinue
            ? "No quedan conflictos bloqueantes. Puedes continuar al resumen final."
            : `Resuelve ${unresolvedBlockers.length} conflicto(s) bloqueante(s) para continuar.`}
        </p>
        <button
          type="button"
          onClick={handleContinue}
          disabled={!canContinue || busy}
          className="app-button-primary inline-flex min-h-12 items-center gap-2 px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
        >
          Ver resumen final
        </button>
      </div>

      {/* Barra inferior fija (mobile) */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-2 border-t border-[#e4e7ec] bg-white px-3 py-2 shadow-[0_-4px_12px_rgba(17,19,24,0.08)] sm:hidden">
        <button
          type="button"
          onClick={() => goToStep(-1)}
          disabled={focusIndex <= 0}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-[#e4e7ec] disabled:opacity-40"
          aria-label="Anterior"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleContinue}
          disabled={!canContinue || busy}
          className="app-button-primary flex min-h-11 flex-1 items-center justify-center text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
        >
          {canContinue ? "Ver resumen final" : "Guardar decisión"}
        </button>
        <button
          type="button"
          onClick={() => goToStep(1)}
          disabled={focusIndex >= pendingFindings.length - 1}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-[#e4e7ec] disabled:opacity-40"
          aria-label="Siguiente"
        >
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
      <div className="h-16 sm:hidden" aria-hidden="true" />
    </div>
  );
}

function SummaryStat({ label, value, tone }: { label: string; value: number; tone?: "block" | "ok" }) {
  const toneClass =
    tone === "block" && value > 0
      ? "bg-[#fdf1ef] text-[#8a2c22]"
      : tone === "ok"
        ? "bg-[#eefbf1] text-[#1f6d33]"
        : "bg-[#f7f8fa] text-[#344054]";
  return (
    <div className={`rounded-xl px-3 py-2 ${toneClass}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  );
}

function RowsComparison({ finding }: { finding: QualityFinding }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {finding.rows.map((row) => (
        <div key={row.rowNumber} className="rounded-lg border border-[#e4e7ec] bg-[#f7f8fa] p-3 text-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-[#98a2b3]">Fila {row.rowNumber}</div>
          <div className="font-semibold text-[#111318]">{row.nombre}</div>
          <div className="text-[#667085]">{row.marca}</div>
          <div className="text-[#667085]">
            {row.contenido} · {formatCurrency(row.costo)}
          </div>
        </div>
      ))}
      {finding.existing ? (
        <div className="rounded-lg border border-[#d8cdfe] bg-[#f5f2ff] p-3 text-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-[#7357ff]">Producto existente</div>
          <div className="font-semibold text-[#111318]">{finding.existing.nombre}</div>
          <div className="text-[#667085]">{finding.existing.marca}</div>
          <div className="text-[#667085]">
            {finding.existing.contenido} · {formatCurrency(finding.existing.costoUnitario)} · SKU {finding.existing.sku}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FindingCard({
  finding,
  decision,
  focused,
  onApply,
  onClear
}: {
  finding: QualityFinding;
  decision: QualityDecision | undefined;
  focused: boolean;
  onApply: (decision: QualityDecision) => void;
  onClear: () => void;
}) {
  const [optionId, setOptionId] = useState(decision?.optionId ?? "");
  const [textValue, setTextValue] = useState(decision?.textValue ?? "");
  const [numberValue, setNumberValue] = useState(decision?.numberValue?.toString() ?? "");
  const [costFromRow, setCostFromRow] = useState<number | undefined>(decision?.costFromRow);
  const [applyToAllInFile, setApplyToAllInFile] = useState(Boolean(decision?.applyToAllInFile));

  const needsCostChoice =
    finding.type === "POSSIBLE_DUPLICATE" &&
    (optionId === "UNIFY_UNDER_FIRST" || optionId === "UNIFY_UNDER_SECOND" || optionId === "SET_CANONICAL_NAME");
  const needsCanonicalName = optionId === "SET_CANONICAL_NAME";
  const needsRenameSecond = finding.type === "EXACT_DUPLICATE" && optionId === "KEEP_SEPARATE";
  const needsBrandManual = optionId === "SET_BRAND_MANUAL";
  const needsNameEdit = optionId === "EDIT_NAME";
  const needsCostEdit = optionId === "EDIT_COST";

  function handleApply() {
    if (!optionId) return;
    onApply({
      findingId: finding.id,
      optionId,
      textValue: textValue || undefined,
      numberValue: numberValue ? Number(numberValue) : undefined,
      costFromRow,
      applyToAllInFile: applyToAllInFile || undefined,
      targetProductId: optionId === "UPDATE_EXISTING" ? finding.existingProductId : undefined
    });
  }

  function handleIgnore() {
    onApply({ findingId: finding.id, optionId: "IGNORE_WARNING" });
  }

  const isResolved = Boolean(decision);
  const [rowA, rowB] = finding.rowNumbers;

  return (
    <div
      className={`space-y-3 rounded-xl border p-4 ${
        focused ? "border-[#5434e6] ring-2 ring-[#5434e6]/20" : "border-[#e4e7ec]"
      } ${isResolved ? "bg-[#fbfbff]" : "bg-white"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-[#98a2b3]">
          {TYPE_LABELS[finding.type]}
        </span>
        {severityChip(finding.severity)}
      </div>

      <p className="text-sm text-[#344054]">{finding.explanation}</p>

      <RowsComparison finding={finding} />

      {finding.options.length > 0 ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {finding.options.map((option) => (
              <label
                key={option.id}
                className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${
                  optionId === option.id
                    ? "border-[#5434e6] bg-[#eeebff] text-[#5434e6]"
                    : "border-[#e4e7ec] text-[#344054]"
                }`}
              >
                <input
                  type="radio"
                  name={`option-${finding.id}`}
                  value={option.id}
                  checked={optionId === option.id}
                  onChange={() => setOptionId(option.id)}
                  className="sr-only"
                />
                {option.label}
              </label>
            ))}
          </div>

          {needsCostChoice ? (
            <div className="flex flex-wrap gap-3 text-xs text-[#344054]">
              <span className="font-semibold">Costo a conservar:</span>
              {[rowA, rowB].map((rn) => (
                <label key={rn} className="flex items-center gap-1">
                  <input
                    type="radio"
                    name={`cost-${finding.id}`}
                    checked={costFromRow === rn}
                    onChange={() => setCostFromRow(rn)}
                  />
                  Fila {rn}
                </label>
              ))}
            </div>
          ) : null}

          {needsCanonicalName ? (
            <input
              type="text"
              value={textValue}
              onChange={(event) => setTextValue(event.target.value)}
              placeholder="Nombre canónico final"
              className="w-full rounded-lg border border-[#e4e7ec] px-3 py-2 text-sm"
            />
          ) : null}

          {needsRenameSecond ? (
            <input
              type="text"
              value={textValue}
              onChange={(event) => setTextValue(event.target.value)}
              placeholder={`Nuevo nombre final para la fila ${rowB}`}
              className="w-full rounded-lg border border-[#e4e7ec] px-3 py-2 text-sm"
            />
          ) : null}

          {needsBrandManual ? (
            <input
              type="text"
              value={textValue}
              onChange={(event) => setTextValue(event.target.value)}
              placeholder="Marca final"
              className="w-full rounded-lg border border-[#e4e7ec] px-3 py-2 text-sm"
            />
          ) : null}

          {needsNameEdit ? (
            <input
              type="text"
              value={textValue}
              onChange={(event) => setTextValue(event.target.value)}
              placeholder="Nombre editado"
              className="w-full rounded-lg border border-[#e4e7ec] px-3 py-2 text-sm"
            />
          ) : null}

          {needsCostEdit ? (
            <input
              type="number"
              value={numberValue}
              onChange={(event) => setNumberValue(event.target.value)}
              placeholder="Costo corregido"
              className="w-full rounded-lg border border-[#e4e7ec] px-3 py-2 text-sm"
            />
          ) : null}

          {finding.type === "BRAND_INCONSISTENCY" ? (
            <label className="flex items-center gap-2 text-xs text-[#344054]">
              <input
                type="checkbox"
                checked={applyToAllInFile}
                onChange={(event) => setApplyToAllInFile(event.target.checked)}
              />
              Aplicar esta decisión a todas las filas coincidentes del archivo actual
            </label>
          ) : null}

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={handleApply}
              disabled={!optionId}
              className="min-h-11 rounded-lg bg-[#111318] px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Aplicar
            </button>
            {finding.severity === "WARNING" ? (
              <button
                type="button"
                onClick={handleIgnore}
                className="min-h-11 rounded-lg border border-[#e4e7ec] px-4 py-2 text-xs font-semibold text-[#667085]"
              >
                Omitir advertencia
              </button>
            ) : null}
            {isResolved ? (
              <button
                type="button"
                onClick={onClear}
                className="min-h-11 rounded-lg border border-[#e4e7ec] px-4 py-2 text-xs font-semibold text-[#667085]"
              >
                Volver
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="text-xs text-[#98a2b3]">No requiere ninguna acción.</p>
      )}
    </div>
  );
}
