import type { Metadata } from "next";
import { appInfo } from "@/lib/app-info";
import { AdminPwaInitializer } from "@/components/admin/AdminPwaInitializer";
import { EntitlementNotice } from "@/components/admin/EntitlementNotice";
import { SuspendedAdminScreen } from "@/components/admin/SuspendedAdminScreen";
import { getAuthenticatedAdmin } from "@/lib/admin-auth";
import { getAdminEntitlement } from "@/lib/entitlements";

export const metadata: Metadata = {
  title: "Smellme Admin",
  description: appInfo.tagline,
  manifest: "/admin.webmanifest"
};

type AdminLayoutProps = Readonly<{
  children: React.ReactNode;
}>;

/**
 * Punto CENTRAL de proteccion por entitlement de /admin (Fase 7A, seccion
 * 18 del encargo): un solo chequeo aqui, ninguna pagina/route individual
 * repite esto. Se ejecuta DESPUES de que Auth ya resolvio que hay un admin
 * autenticado -- el entitlement NUNCA reemplaza Auth ni le otorga admin a
 * quien no lo es (seccion 19): un visitante sin sesion (incluida la propia
 * pagina /admin/login) atraviesa este layout sin ninguna llamada a Control.
 *
 * Storefront publico (`app/page.tsx` y el resto fuera de app/admin/) nunca
 * pasa por este layout: no puede verse afectado por ADMIN_ONLY.
 */
export default async function AdminLayout({ children }: AdminLayoutProps) {
  const admin = await getAuthenticatedAdmin();
  const entitlement = admin ? await getAdminEntitlement() : null;

  if (entitlement?.blocked) {
    return (
      <>
        <AdminPwaInitializer />
        <SuspendedAdminScreen
          notice={entitlement.notice}
          variant={entitlement.reason === "configuration-error" ? "configuration-error" : "suspended"}
        />
      </>
    );
  }

  return (
    <>
      <AdminPwaInitializer />
      {entitlement?.notice ? <EntitlementNotice notice={entitlement.notice} /> : null}
      {children}
    </>
  );
}
