import type { Metadata } from "next";
import { AdminPwaInitializer } from "@/components/admin/AdminPwaInitializer";

export const metadata: Metadata = {
  title: "Smellme Admin",
  description: "Panel administrador de Smellme.cl",
  manifest: "/admin.webmanifest"
};

type AdminLayoutProps = Readonly<{
  children: React.ReactNode;
}>;

export default function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <>
      <AdminPwaInitializer />
      {children}
    </>
  );
}
