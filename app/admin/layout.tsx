import type { Metadata } from "next";
import { AdminPwaInitializer } from "@/components/admin/AdminPwaInitializer";

export const metadata: Metadata = {
  title: "Pauli Admin",
  description: "Panel administrador de Pauli Store",
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
