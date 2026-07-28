import { AdminSetPasswordForm } from "@/components/admin/AdminSetPasswordForm";
import { AppFooter } from "@/components/AppFooter";

export default function AdminSetPasswordPage() {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-5xl flex-col px-4 py-6 sm:px-6">
      <div className="flex flex-1 items-center justify-center">
        <div className="w-full max-w-md">
          <div className="mb-5 rounded-[28px] border border-[#d8ebdd] bg-white/90 p-5 text-center shadow-soft">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[#247a4d]">
              Perfume Store
            </div>
            <div className="mt-1 text-lg font-semibold text-[#1f3328]">Definir contraseña</div>
          </div>
          <AdminSetPasswordForm />
        </div>
      </div>
      <AppFooter className="pb-2 pt-6" />
    </main>
  );
}
