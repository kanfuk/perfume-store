import { redirect } from "next/navigation";
import { DirectSaleFastFlow } from "@/components/admin/DirectSaleFastFlow";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getAdminCustomersData } from "@/lib/admin-customers-data";

export default async function AdminVentaDirectaPage() {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/login");
  }

  const initialCustomers = await getAdminCustomersData();

  return <DirectSaleFastFlow initialCustomers={initialCustomers} />;
}
