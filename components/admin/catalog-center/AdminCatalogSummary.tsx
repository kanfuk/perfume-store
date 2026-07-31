import Link from "next/link";
import type { CatalogSummary } from "@/lib/catalog-summary";
import { buildCatalogSectionHref } from "@/lib/admin-catalog-routes";

type MetricTone = "neutral" | "good" | "warn" | "bad";

type MetricDef = {
  key: keyof CatalogSummary;
  label: string;
  href: (q?: string) => string;
  tone: MetricTone;
  /** Metricas incluidas en la tira compacta del shell (visible en todas las rutas). */
  compact?: boolean;
};

const METRICS: MetricDef[] = [
  { key: "total", label: "Total productos", href: (q) => buildCatalogSectionHref("productos", { q }), tone: "neutral", compact: true },
  { key: "activos", label: "Activos", href: (q) => buildCatalogSectionHref("productos", { estado: "activos", q }), tone: "good" },
  { key: "pausados", label: "Pausados", href: (q) => buildCatalogSectionHref("productos", { estado: "pausados", q }), tone: "neutral" },
  { key: "disponibles", label: "Disponibles", href: (q) => buildCatalogSectionHref("stock", { stock: "disponible", q }), tone: "good" },
  { key: "sinStock", label: "Sin stock", href: (q) => buildCatalogSectionHref("stock", { stock: "agotado", q }), tone: "bad", compact: true },
  { key: "incompletos", label: "Ficha incompleta", href: (q) => buildCatalogSectionHref("productos", { estado: "incompleto", q }), tone: "warn", compact: true },
  { key: "preciosAuto", label: "Precio automático", href: (q) => buildCatalogSectionHref("precios", { modo: "AUTO", q }), tone: "neutral" },
  { key: "preciosManual", label: "Precio manual", href: (q) => buildCatalogSectionHref("precios", { modo: "MANUAL", q }), tone: "warn" },
  { key: "top12Asignados", label: "Top 12 asignados", href: (q) => buildCatalogSectionHref("top12", { estado: "asignado", q }), tone: "good" },
  { key: "top12Pendientes", label: "Top 12 pendientes", href: (q) => buildCatalogSectionHref("top12", { estado: "pendiente", q }), tone: "warn", compact: true }
];

const TILE_TONE_CLASSES: Record<MetricTone, string> = {
  neutral: "bg-[#f7f8fa] text-[#344054] hover:border-[#c1b6ff]",
  good: "bg-[#eefbf1] text-[#1f6d33] hover:border-[#bfe6c6]",
  warn: "bg-[#fff8ec] text-[#8a5a00] hover:border-[#f3d38a]",
  bad: "bg-[#fdf1ef] text-[#8a2c22] hover:border-[#f3c6c0]"
};

type AdminCatalogSummaryProps = {
  summary: CatalogSummary;
  /** Termino de busqueda comun actual, para que las metricas abran la vista filtrada sin perderlo. */
  q?: string;
  /** Tira condensada (4 numeros clave) para el shell; por defecto renderiza la grilla completa del resumen. */
  compact?: boolean;
};

/**
 * Metricas accionables de "Gestion de catalogo" (Fase 3A). Cada tarjeta
 * enlaza a la seccion+filtro correspondiente -- nunca ejecuta una accion
 * masiva directamente desde aqui (seccion 14 del encargo). En modo
 * `compact` (usado dentro del shell, visible en todas las rutas anidadas)
 * solo se muestran 4 numeros clave en una tira liviana.
 */
export function AdminCatalogSummary({ summary, q, compact = false }: AdminCatalogSummaryProps) {
  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/70">
        {METRICS.filter((metric) => metric.compact).map((metric) => (
          <Link key={metric.key} href={metric.href(q)} className="inline-flex items-center gap-1.5 hover:text-white">
            <span className="text-sm font-bold text-white">{summary[metric.key]}</span>
            {metric.label}
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {METRICS.map((metric) => (
        <Link
          key={metric.key}
          href={metric.href(q)}
          className={`rounded-xl border border-transparent px-4 py-3 transition ${TILE_TONE_CLASSES[metric.tone]}`}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{metric.label}</div>
          <div className="mt-1 text-2xl font-bold">{summary[metric.key]}</div>
        </Link>
      ))}
    </div>
  );
}
