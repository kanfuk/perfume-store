import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import { AdminLoginForm } from "@/components/admin/AdminLoginForm";
import { AppFooter } from "@/components/AppFooter";
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
    <main className="min-h-[100dvh] bg-white">
      <div className="grid lg:min-h-[calc(100dvh-72px)] lg:grid-cols-[0.9fr_1.1fr]">
        <section className="relative isolate flex overflow-hidden bg-[#17191f] px-6 py-8 text-white sm:px-10 lg:items-end lg:p-14">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_30%_20%,rgba(115,87,255,0.45),transparent_30%),radial-gradient(circle_at_80%_90%,rgba(110,139,255,0.18),transparent_32%)]" />
          <div className="max-w-xl">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white font-bold text-[#17191f]">S</span>
              <span className="font-bold">Smellme.cl</span>
            </div>
            <div className="mt-16 hidden lg:block">
              <Sparkles className="h-6 w-6 text-[#c8c0ff]" />
              <h1 className="mt-5 text-5xl font-bold leading-[0.98] tracking-[-0.055em]">
                Tu negocio, claro y bajo control.
              </h1>
              <p className="mt-5 max-w-md text-base leading-7 text-white/60">
                Pedidos, stock, clientes y ventas en una sola vista operativa.
              </p>
            </div>
          </div>
        </section>

        <section className="flex items-start justify-center px-5 py-10 sm:px-10 lg:items-center lg:px-16">
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
