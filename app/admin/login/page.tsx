import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/admin/AdminLoginForm";
import { AppFooter } from "@/components/AppFooter";
import { isAdminAuthenticated } from "@/lib/admin-auth";

type AdminLoginPageProps = {
  searchParams: Promise<{
    next?: string;
  }>;
};

export default async function AdminLoginPage({
  searchParams
}: AdminLoginPageProps) {
  if (await isAdminAuthenticated()) {
    redirect("/admin");
  }

  const params = await searchParams;

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-5xl flex-col px-4 py-6 sm:px-6">
      <div className="flex flex-1 items-center justify-center">
        <div className="w-full max-w-md">
          <AdminLoginForm nextPath={params.next || "/admin"} defaultEmail="" />
        </div>
      </div>
      <AppFooter className="pb-2 pt-6" />
    </main>
  );
}
