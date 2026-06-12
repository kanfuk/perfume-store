import { redirect } from "next/navigation";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { ESTADO_PEDIDO_AGENDADO, ESTADO_PEDIDO_PENDIENTE } from "@/lib/constants";
import { createPedidoService } from "@/services/pedidoService";

export default async function AdminPage() {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/login");
  }

  const pedidoService = createPedidoService();
  const [pendientes, agendados] = await Promise.all([
    pedidoService.obtenerPedidosPorEstado(ESTADO_PEDIDO_PENDIENTE),
    pedidoService.obtenerPedidosPorEstado(ESTADO_PEDIDO_AGENDADO)
  ]);

  return <AdminDashboard initialData={{ pendientes, agendados }} />;
}
