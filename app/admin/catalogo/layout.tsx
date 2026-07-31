import { Suspense } from "react";
import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getCachedCatalogSummary } from "@/lib/admin-catalog-data";
import { AdminCatalogShell } from "@/components/admin/catalog-center/AdminCatalogShell";
import { AdminCatalogSkeleton } from "@/components/admin/catalog-center/AdminCatalogSkeleton";

/**
 * Layout compartido de "Gestion de catalogo" (Fase 3A). La sesion se valida
 * UNA sola vez aqui, en el servidor: ninguna de las rutas anidadas
 * (productos/stock/precios/top12) repite `isAdminAuthenticated()`.
 *
 * El resumen de metricas se calcula tambien en el servidor
 * (ProductoService.obtenerResumenCatalogo(), sin round-trip HTTP) y se pasa
 * como snapshot inicial al shell: queda fresco en cada carga completa y tras
 * cualquier `router.refresh()`. Como es un layout compartido, Next.js puede
 * reutilizarlo entre navegaciones client-side dentro de /admin/catalogo/*,
 * asi que el snapshot puede no reflejar una mutacion hecha segundos antes en
 * otro panel sin recargar o volver a entrar. Es una decision deliberada
 * (ver seccion 12 del encargo y docs/SMELLME_ADMIN_CONTROL_CENTER_FOUNDATION.md):
 * mantener esto sincronizado en vivo exigiria tocar la logica interna de
 * cada panel (Stock/Precios/Top12/Productos), lo cual esta fuera de alcance.
 */
export default async function AdminCatalogoLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/login");
  }

  const summary = await getCachedCatalogSummary();

  return (
    <Suspense fallback={<AdminCatalogSkeleton />}>
      <AdminCatalogShell initialSummary={summary}>{children}</AdminCatalogShell>
    </Suspense>
  );
}
