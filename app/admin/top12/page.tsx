import { redirect } from "next/navigation";
import { Top12AdminPanel } from "@/components/admin/Top12AdminPanel";
import { isAdminAuthenticated } from "@/lib/admin-auth";

export default async function AdminTop12Page() {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/login");
  }

  return <Top12AdminPanel />;
}
