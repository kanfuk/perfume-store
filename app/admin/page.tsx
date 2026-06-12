import { redirect } from "next/navigation";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { createPedidoService } from "@/services/pedidoService";

export default async function AdminPage() {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/login");
  }

  const pedidoService = createPedidoService();
  const dashboard = await pedidoService.obtenerDashboardAdmin();

  return <AdminDashboard initialData={dashboard} />;
}
