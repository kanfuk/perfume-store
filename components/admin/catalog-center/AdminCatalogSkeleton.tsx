/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Centro administrativo unificado - Fase 3A
 * Descripcion: Skeleton inmediato para las rutas de /admin/catalogo. Se usa
 * como app/admin/catalogo/loading.tsx (Next.js lo muestra automaticamente
 * mientras el segmento de ruta activo carga, sin bloquear el layout/shell
 * ya montado) y puede reutilizarse donde haga falta un estado de carga
 * equivalente.
 */
export function AdminCatalogSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-4" role="status">
      <span className="sr-only">Cargando…</span>
      <div className="h-10 w-48 animate-pulse rounded-xl bg-[#e4e7ec]" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-16 animate-pulse rounded-xl bg-[#e4e7ec]" />
        ))}
      </div>
      <div className="space-y-3 rounded-2xl border border-[#e4e7ec] bg-white p-5">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-14 animate-pulse rounded-xl bg-[#f2f4f7]" />
        ))}
      </div>
    </div>
  );
}
