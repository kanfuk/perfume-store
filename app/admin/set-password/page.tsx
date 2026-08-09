import { AdminSetPasswordForm } from "@/components/admin/AdminSetPasswordForm";
import { AppFooter } from "@/components/AppFooter";
import { SmellmeLogo } from "@/components/SmellmeBrand";

export default function AdminSetPasswordPage() {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-5xl flex-col bg-[#f7f1e8] px-4 py-6 sm:px-6">
      <div className="flex flex-1 items-center justify-center">
        <div className="w-full max-w-md">
          <div className="mb-5 flex flex-col items-center rounded-[28px] border border-[#DDD0C1] bg-[#0b0b0b] p-5 text-center shadow-[0_18px_50px_rgba(25,23,20,0.2)]">
            <SmellmeLogo className="mb-3 h-24 w-32" priority />
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[#8A6036]">
              Smellme.cl
            </div>
            <div className="mt-1 text-lg font-semibold text-[#f7f1e8]">Definir contraseña</div>
          </div>
          <AdminSetPasswordForm />
        </div>
      </div>
      <AppFooter className="pb-2 pt-6" />
    </main>
  );
}
