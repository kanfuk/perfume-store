import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import { AdminLoginForm } from "@/components/admin/AdminLoginForm";
import { AppFooter } from "@/components/AppFooter";
import { SmellmeLogo, SmellmeMonogram } from "@/components/SmellmeBrand";
import { isAdminAuthenticated } from "@/lib/admin-auth";

type AdminLoginPageProps = {
  searchParams: Promise<{ next?: string }>;
};

export default async function AdminLoginPage({ searchParams }: AdminLoginPageProps) {
  if (await isAdminAuthenticated()) {
    redirect("/admin");
  }

  const params = await searchParams;

  return (
    <main className="min-h-[100dvh] bg-[#f7f1e8]">
      <div className="grid lg:min-h-[calc(100dvh-72px)] lg:grid-cols-[0.9fr_1.1fr]">
        <section className="relative isolate flex overflow-hidden bg-[#0b0b0b] px-6 py-8 text-white sm:px-10 lg:items-center lg:p-14">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_30%_20%,rgba(203,148,120,0.26),transparent_30%),radial-gradient(circle_at_80%_90%,rgba(184,139,88,0.16),transparent_32%)]" />
          <div className="max-w-xl">
            <div className="flex items-center gap-3">
              <SmellmeMonogram className="h-12 w-12" priority />
              <span className="font-semibold tracking-wide text-[#f7f1e8]">Smellme.cl</span>
            </div>
            <div className="mt-16 hidden lg:block">
              <SmellmeLogo className="mb-8 h-32 w-44 border border-[#e8c79e]/15 shadow-[0_24px_60px_rgba(0,0,0,0.4)]" priority />
              <Sparkles className="h-6 w-6 text-[#E8C79E]" />
              <h1 className="mt-5 text-5xl font-bold leading-[0.98] tracking-[-0.055em]">
                Tu negocio, claro y bajo control.
              </h1>
              <p className="mt-5 max-w-md text-base leading-7 text-[#e8ded0]/65">
                Pedidos, stock, clientes y ventas en una sola vista operativa.
              </p>
            </div>
          </div>
        </section>

        <section className="flex items-start justify-center px-5 py-10 sm:px-10 lg:items-center lg:bg-[#fffcf7] lg:px-16">
          <div className="w-full max-w-md">
            <AdminLoginForm nextPath={params.next || "/admin"} defaultEmail="" />
          </div>
        </section>
      </div>
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <AppFooter />
      </div>
    </main>
  );
}
