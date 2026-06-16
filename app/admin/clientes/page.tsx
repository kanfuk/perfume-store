import { redirect } from "next/navigation";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getAdminPageData } from "@/lib/admin-dashboard-data";

export default async function AdminClientesPage() {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/login");
  }

  const initialData = await getAdminPageData();

  return <AdminDashboard initialData={initialData} initialView="clientes" />;
}
