import { redirect } from "next/navigation";
import { AdminDirectSale } from "@/components/admin/AdminDirectSale";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getAdminPageData } from "@/lib/admin-dashboard-data";

export default async function AdminVentaDirectaPage() {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/login");
  }

  const initialData = await getAdminPageData();

  return (
    <AdminDirectSale
      initialDashboard={initialData.dashboard}
      initialProducts={initialData.productos}
    />
  );
}
