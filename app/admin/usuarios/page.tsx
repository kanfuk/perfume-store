import { redirect } from "next/navigation";
import { AppFooter } from "@/components/AppFooter";
import { SmellmeMonogram } from "@/components/SmellmeBrand";
import { AdminUsersPanel } from "@/components/admin/AdminUsersPanel";
import { AdminNav } from "@/components/admin/dashboard/AdminNav";
import { getAuthenticatedAdmin, isOwnerAdmin } from "@/lib/admin-auth";

export default async function AdminUsersPage() {
  const admin = await getAuthenticatedAdmin();
  if (!admin) redirect("/admin/login");
  if (!isOwnerAdmin(admin)) redirect("/admin");

  return (
    <main className="mx-auto min-h-[100dvh] w-full max-w-7xl bg-[#F7F1E8] px-3 pb-24 pt-4 sm:px-6 sm:pb-8">
      <header className="mb-3 flex items-center gap-3 rounded-2xl border border-[#DDD0C1] bg-[#0B0B0B] px-4 py-3 text-[#F7F1E8]">
        <SmellmeMonogram className="h-12 w-12 rounded-xl" priority />
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E8C79E]">Smellme.cl</p><p className="font-bold">Gestión de accesos</p></div>
      </header>
      <AdminNav isOwner />
      <div className="py-5"><AdminUsersPanel /></div>
      <AppFooter className="pt-5" />
    </main>
  );
}
