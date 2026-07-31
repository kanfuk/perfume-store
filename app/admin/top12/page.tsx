import { redirect } from "next/navigation";
import { resolveLegacyCatalogRedirect, buildQueryStringFromParams } from "@/lib/admin-catalog-routes";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Fase 3A: /admin/top12 ahora vive dentro de "Gestion de catalogo". Esta
 * ruta solo redirige, preservando busqueda/filtros; la sesion la valida
 * app/admin/catalogo/layout.tsx en el destino (no hace falta repetirla aqui).
 */
export default async function AdminTop12LegacyRedirectPage({ searchParams }: Props) {
  const params = await searchParams;
  const target = resolveLegacyCatalogRedirect("/admin/top12", buildQueryStringFromParams(params));
  redirect(target ?? "/admin/catalogo/top12");
}
