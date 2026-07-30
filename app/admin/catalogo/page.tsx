import { redirect } from "next/navigation";
import { CatalogControlCenter } from "@/components/admin/CatalogControlCenter";
import { isAdminAuthenticated } from "@/lib/admin-auth";

export default async function AdminCatalogoPage() {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/login");
  }

  return <CatalogControlCenter />;
}
