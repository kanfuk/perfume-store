import { redirect } from "next/navigation";
import { QuickPriceEditPanel } from "@/components/admin/QuickPriceEditPanel";
import { isAdminAuthenticated } from "@/lib/admin-auth";

export default async function AdminPreciosPage() {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/login");
  }

  return <QuickPriceEditPanel />;
}
