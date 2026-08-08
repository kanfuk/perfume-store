"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Home, Sparkles, UploadCloud } from "lucide-react";
import { SmellmeMonogram } from "@/components/SmellmeBrand";
import { AdminCatalogNavigation } from "@/components/admin/catalog-center/AdminCatalogNavigation";
import { AdminCatalogSearch } from "@/components/admin/catalog-center/AdminCatalogSearch";
import { AdminCatalogSummary } from "@/components/admin/catalog-center/AdminCatalogSummary";
import type { CatalogSummary } from "@/lib/catalog-summary";

const SEARCH_DEBOUNCE_MS = 350;

type AdminCatalogShellProps = {
  initialSummary: CatalogSummary;
  children: React.ReactNode;
};

/**
 * Carcasa compartida de "Gestion de catalogo" (Fase 3A). Monta UNA vez por
 * navegacion dentro de /admin/catalogo/*; el contenido de cada seccion
 * (Productos/Stock/Precios/Top12) llega como `children` desde la ruta
 * activa -- nunca los cuatro paneles a la vez.
 *
 * Unico punto que lee `useSearchParams()` de todo el shell (aislado aqui a
 * proposito): la seccion activa la resuelve AdminCatalogNavigation con
 * `usePathname()`, que no requiere Suspense.
 */
export function AdminCatalogShell({ initialSummary, children }: AdminCatalogShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";

  const [searchValue, setSearchValue] = useState(urlQuery);

  // Si el usuario navega de seccion (Link) o retrocede, refleja el `q` real de la URL.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearchValue(urlQuery);
  }, [urlQuery]);

  // Debounce moderado: no se actualiza la URL (ni se vuelve a renderizar la
  // pagina servidor de la seccion activa) en cada tecla.
  useEffect(() => {
    if (searchValue === urlQuery) return;

    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (searchValue.trim()) {
        params.set("q", searchValue);
      } else {
        params.delete("q");
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchValue]);

  const effectiveQuery = useMemo(() => (urlQuery || undefined), [urlQuery]);

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-[1400px] flex-col gap-5 overflow-x-hidden bg-[#F7F1E8] px-4 py-4 pb-[calc(88px+env(safe-area-inset-bottom))] sm:px-6 lg:px-8">
      <section className="overflow-hidden rounded-2xl bg-[#171613] text-white shadow-[0_16px_36px_rgba(17,19,24,0.16)]">
        <div className="space-y-4 bg-[radial-gradient(circle_at_80%_20%,rgba(203,148,120,0.24),transparent_28%)] p-5 sm:p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-1.5">
              <span className="inline-flex w-fit items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#E8C79E]">
                <SmellmeMonogram className="h-8 w-8 rounded-lg" />
                <Sparkles className="h-3.5 w-3.5" />
                Admin Smellme.cl
              </span>
              <h1 className="text-2xl font-bold tracking-[-0.03em] text-white sm:text-3xl">Gestión de catálogo</h1>
              <p className="max-w-2xl text-sm leading-6 text-white/60">
                Administra productos, disponibilidad, precios y destacados desde un solo lugar.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Link
                href="/admin/importar-catalogo"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white/10 px-3.5 py-2 text-sm font-semibold text-white hover:bg-white/15"
              >
                <UploadCloud className="h-4 w-4" />
                <span className="hidden sm:inline">Importar catálogo</span>
                <span className="sm:hidden">Importar</span>
              </Link>
              <Link
                href="/admin"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3.5 py-2 text-sm font-semibold text-white hover:bg-white/15"
              >
                <Home className="h-4 w-4" />
                <span className="hidden sm:inline">Inicio</span>
              </Link>
            </div>
          </div>

          <AdminCatalogSummary summary={initialSummary} q={effectiveQuery} compact />
        </div>
      </section>

      <AdminCatalogSearch value={searchValue} onChange={setSearchValue} />

      <AdminCatalogNavigation q={effectiveQuery} />

      <div id="admin-catalog-section-content" className="min-w-0">
        {children}
      </div>
    </main>
  );
}
