import { cache } from "react";
import { createProductoService } from "@/services/productoService";

/**
 * Envuelve `obtenerResumenCatalogo` con `React.cache()` para que
 * `app/admin/catalogo/layout.tsx` y `app/admin/catalogo/page.tsx` (que la
 * necesitan por separado, cada uno como Server Component) reutilicen el
 * mismo resultado dentro de una misma peticion en vez de consultar el
 * repositorio dos veces (seccion 12 del encargo: "ninguna consulta
 * duplicada innecesaria").
 */
export const getCachedCatalogSummary = cache(async () => {
  const productoService = createProductoService();
  return productoService.obtenerResumenCatalogo();
});
