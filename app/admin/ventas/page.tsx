import { redirect } from "next/navigation";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { getAuthenticatedAdmin } from "@/lib/admin-auth";
import { getAdminPageData } from "@/lib/admin-dashboard-data";

export default async function AdminVentasPage() {
  const admin = await getAuthenticatedAdmin();
  if (!admin) {
    redirect("/admin/login");
  }

  const initialData = await getAdminPageData();

  return <AdminDashboard initialData={initialData} initialView="cobros" isOwner={admin.rol === "OWNER"} />;
}
