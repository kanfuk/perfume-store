import { redirect } from "next/navigation";
import { MaintenancePanel } from "@/components/admin/MaintenancePanel";
import { isAdminAuthenticated } from "@/lib/admin-auth";

export default async function AdminMaintenancePage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login");
  return <MaintenancePanel />;
}
