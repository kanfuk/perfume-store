"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CATALOG_SECTIONS,
  CATALOG_SECTION_LABELS,
  buildCatalogSectionHref,
  resolveActiveCatalogSection
} from "@/lib/admin-catalog-routes";

type AdminCatalogNavigationProps = {
  /** Termino de busqueda comun actual, preservado al cambiar de seccion. */
  q?: string;
};

/**
 * Navegacion por secciones de "Gestion de catalogo" (Fase 3A). Usa
 * next/link (prefetch) en vez de estado local: cada seccion es una ruta
 * real que monta solo su propio modulo, nunca los cuatro paneles a la vez.
 * `usePathname()` no requiere Suspense (a diferencia de useSearchParams),
 * por eso esta pieza vive fuera del boundary que envuelve la busqueda.
 */
export function AdminCatalogNavigation({ q }: AdminCatalogNavigationProps) {
  const pathname = usePathname();
  const active = resolveActiveCatalogSection(pathname);

  return (
    <nav aria-label="Secciones de Gestión de catálogo" className="sticky top-0 z-10 -mx-4 bg-[#F7F1E8]/95 px-4 py-2 backdrop-blur sm:static sm:mx-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {CATALOG_SECTIONS.map((section) => {
          const isActive = section === active;
          return (
            <Link
              key={section}
              href={buildCatalogSectionHref(section, { q })}
              aria-current={isActive ? "page" : undefined}
              className={`flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-semibold transition ${
                isActive
                  ? "border-[#B88B58] bg-[#F4E8DB] text-[#8A6036]"
                  : "border-[#DDD0C1] bg-white text-[#4D453D] hover:border-[#D8BEA2]"
              }`}
            >
              {CATALOG_SECTION_LABELS[section]}
            </Link>
          );
        })}
      </div>
      {/* Anuncio discreto al cambiar de seccion (seccion 16): no todo el */}
      {/* contenido es una region "live" (eso spamearia cada tecla escrita */}
      {/* dentro del panel), solo el nombre de la seccion activa. */}
      <p className="sr-only" aria-live="polite" role="status">
        Sección activa: {active ? CATALOG_SECTION_LABELS[active] : ""}
      </p>
    </nav>
  );
}
