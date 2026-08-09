import type { Metadata } from "next";
import { appInfo } from "@/lib/app-info";
import { AdminPwaInitializer } from "@/components/admin/AdminPwaInitializer";

export const metadata: Metadata = {
  title: "Smellme Admin",
  description: appInfo.tagline,
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
