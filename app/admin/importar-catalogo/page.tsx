import { redirect } from "next/navigation";
import { CatalogImportPanel } from "@/components/admin/CatalogImportPanel";
import { isAdminAuthenticated } from "@/lib/admin-auth";

export default async function AdminImportarCatalogoPage() {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/login");
  }

  return <CatalogImportPanel />;
}
