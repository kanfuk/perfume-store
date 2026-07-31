import { QuickStockPanel } from "@/components/admin/QuickStockPanel";

type Props = {
  searchParams: Promise<{ q?: string; stock?: string }>;
};

/** La sesion ya la valida app/admin/catalogo/layout.tsx. */
export default async function AdminCatalogoStockPage({ searchParams }: Props) {
  const { q, stock } = await searchParams;

  return <QuickStockPanel embedded initialSearch={q} initialFilter={stock} />;
}
