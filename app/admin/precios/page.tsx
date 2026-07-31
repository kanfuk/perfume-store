import { redirect } from "next/navigation";
import { resolveLegacyCatalogRedirect, buildQueryStringFromParams } from "@/lib/admin-catalog-routes";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Fase 3A: /admin/precios ahora vive dentro de "Gestion de catalogo". Esta
 * ruta solo redirige, preservando busqueda/filtros; la sesion la valida
 * app/admin/catalogo/layout.tsx en el destino (no hace falta repetirla aqui).
 */
export default async function AdminPreciosLegacyRedirectPage({ searchParams }: Props) {
  const params = await searchParams;
  const target = resolveLegacyCatalogRedirect("/admin/precios", buildQueryStringFromParams(params));
  redirect(target ?? "/admin/catalogo/precios");
}
