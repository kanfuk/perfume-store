import { CatalogControlCenter } from "@/components/admin/CatalogControlCenter";

type Props = {
  searchParams: Promise<{ q?: string; estado?: string }>;
};

/** La sesion ya la valida app/admin/catalogo/layout.tsx. */
export default async function AdminCatalogoProductosPage({ searchParams }: Props) {
  const { q, estado } = await searchParams;

  return <CatalogControlCenter embedded initialSearch={q} initialFilter={estado} />;
}
