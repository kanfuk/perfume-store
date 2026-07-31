import { AdminCatalogSkeleton } from "@/components/admin/catalog-center/AdminCatalogSkeleton";

/**
 * Next.js muestra este archivo automaticamente (via Suspense) mientras el
 * segmento de ruta activo (resumen/productos/stock/precios/top12) carga,
 * sin desmontar el layout/shell ya visible.
 */
export default function AdminCatalogoLoading() {
  return <AdminCatalogSkeleton />;
}
