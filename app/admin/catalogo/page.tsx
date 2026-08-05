import Link from "next/link";
import { CircleDollarSign, ClipboardList, ShieldAlert, Sparkles, Tag, UploadCloud } from "lucide-react";
import { getCachedCatalogSummary } from "@/lib/admin-catalog-data";
import { buildCatalogSectionHref } from "@/lib/admin-catalog-routes";
import { AdminCatalogSummary } from "@/components/admin/catalog-center/AdminCatalogSummary";
import { OFFERS_LIMIT, TOP_PRODUCTS_LIMIT } from "@/lib/constants";

type AdminCatalogoResumenPageProps = {
  searchParams: Promise<{ q?: string }>;
};

/**
 * Resumen operativo de "Gestion de catalogo" (Fase 3A): metricas
 * accionables, no una segunda lista completa de productos (esa vive en
 * /admin/catalogo/productos, reutilizando CatalogControlCenter). Nunca
 * renderiza las fichas completas del catalogo aqui. La sesion ya la valida
 * app/admin/catalogo/layout.tsx.
 */
export default async function AdminCatalogoResumenPage({ searchParams }: AdminCatalogoResumenPageProps) {
  const { q } = await searchParams;
  const summary = await getCachedCatalogSummary();

  const quickActions = [
    {
      href: "/admin/importar-catalogo",
      icon: UploadCloud,
      label: "Importar catálogo",
      description: "Sube el CSV del proveedor con revisión guiada."
    },
    {
      href: buildCatalogSectionHref("productos", { estado: "incompleto", q }),
      icon: ShieldAlert,
      label: "Revisar fichas incompletas",
      description: `${summary.incompletos} producto(s) sin nombre, marca, contenido o precio válido.`
    },
    {
      href: buildCatalogSectionHref("stock", { q }),
      icon: ClipboardList,
      label: "Ajustar stock",
      description: "Selección masiva, disponibilidad y stock rápido."
    },
    {
      href: buildCatalogSectionHref("precios", { modo: "MANUAL", q }),
      icon: CircleDollarSign,
      label: "Revisar precios manuales",
      description: `${summary.preciosManual} producto(s) con precio fijado a mano.`
    },
    {
      href: buildCatalogSectionHref("top12", { q }),
      icon: Sparkles,
      label: `Configurar Top ${TOP_PRODUCTS_LIMIT}`,
      description: `${summary.top12Pendientes} posición(es) pendiente(s) de asignar.`
    },
    {
      href: buildCatalogSectionHref("ofertas", { q }),
      icon: Tag,
      label: "Configurar Ofertas de la semana",
      description: `${summary.ofertasAsignadas} de ${OFFERS_LIMIT} ofertas activas.`
    }
  ];

  return (
    <div className="space-y-5">
      <AdminCatalogSummary summary={summary} q={q} />

      <section className="space-y-3 rounded-2xl border border-[#e4e7ec] bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-[#111318]">Acciones rápidas</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="flex min-h-[88px] flex-col gap-1.5 rounded-xl border border-[#e4e7ec] bg-[#f7f8fa] p-4 transition hover:border-[#c1b6ff] hover:bg-white"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-[#111318]">
                <action.icon className="h-4 w-4 text-[#7357ff]" />
                {action.label}
              </span>
              <span className="text-xs leading-5 text-[#667085]">{action.description}</span>
            </Link>
          ))}
        </div>
        <p className="text-xs text-[#98a2b3]">
          Las acciones masivas (activar, pausar, ajustar stock o precio) solo se ejecutan dentro de cada
          módulo, con vista previa y confirmación — nunca desde este resumen.
        </p>
      </section>
    </div>
  );
}
