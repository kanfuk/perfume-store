import { QuickPriceEditPanel } from "@/components/admin/QuickPriceEditPanel";

type Props = {
  searchParams: Promise<{ q?: string; modo?: string }>;
};

/** La sesion ya la valida app/admin/catalogo/layout.tsx. */
export default async function AdminCatalogoPreciosPage({ searchParams }: Props) {
  const { q, modo } = await searchParams;

  return <QuickPriceEditPanel embedded initialSearch={q} initialFilter={modo} />;
}
