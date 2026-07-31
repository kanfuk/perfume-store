import { Top12AdminPanel } from "@/components/admin/Top12AdminPanel";

type Props = {
  searchParams: Promise<{ estado?: string }>;
};

/** La sesion ya la valida app/admin/catalogo/layout.tsx. */
export default async function AdminCatalogoTop12Page({ searchParams }: Props) {
  const { estado } = await searchParams;

  return <Top12AdminPanel embedded initialFilter={estado} />;
}
