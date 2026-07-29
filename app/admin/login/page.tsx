import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/admin/AdminLoginForm";
import { AppFooter } from "@/components/AppFooter";
import { isAdminAuthenticated } from "@/lib/admin-auth";

type AdminLoginPageProps = {
  searchParams: Promise<{
    next?: string;
  }>;
};

export default async function AdminLoginPage({ searchParams }: AdminLoginPageProps) {
  if (await isAdminAuthenticated()) {
    redirect("/admin");
  }

  const params = await searchParams;

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-5xl flex-col px-4 py-6 sm:px-6">
      <div className="flex flex-1 items-center justify-center">
        <div className="w-full max-w-md">
          <div className="mb-5 rounded-[28px] border border-[#e3d9c8] bg-white/90 p-5 text-center shadow-soft">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[22px] bg-[#231f19]">
              <span className="font-display text-3xl font-semibold text-[#faf7f1]">S</span>
            </div>
            <div className="mt-3 text-xs font-semibold uppercase tracking-[0.22em] text-[#6b4a26]">
              Smellme.cl
            </div>
            <div className="mt-1 text-lg font-semibold text-[#231f19]">Panel administrador</div>
          </div>
          <AdminLoginForm nextPath={params.next || "/admin"} defaultEmail="" />
        </div>
      </div>
      <AppFooter className="pb-2 pt-6" />
    </main>
  );
}
