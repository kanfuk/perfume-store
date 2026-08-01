import { redirect } from "next/navigation";
import { AdminCustomOrder } from "@/components/admin/AdminCustomOrder";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getAdminCustomersData } from "@/lib/admin-customers-data";
import { getAdminPageData } from "@/lib/admin-dashboard-data";

export default async function AdminPedidosPersonalizadosPage() {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/login");
  }

  const [initialData, initialCustomers] = await Promise.all([
    getAdminPageData(),
    getAdminCustomersData()
  ]);

  return (
    <AdminCustomOrder
      initialDashboard={initialData.dashboard}
      initialProducts={initialData.productos}
      initialCustomers={initialCustomers}
    />
  );
}
