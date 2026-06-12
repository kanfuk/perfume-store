import { redirect } from "next/navigation";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { createProductoService } from "@/services/productoService";
import { createPedidoService } from "@/services/pedidoService";

export default async function AdminPage() {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/login");
  }

  const pedidoService = createPedidoService();
  const productoService = createProductoService();
  const [dashboard, productos] = await Promise.all([
    pedidoService.obtenerDashboardAdmin(),
    productoService.obtenerCatalogoAdmin()
  ]);

  return <AdminDashboard initialData={{ dashboard, productos }} />;
}
