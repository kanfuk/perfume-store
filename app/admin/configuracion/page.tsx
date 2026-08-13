import { redirect } from "next/navigation";
import { BusinessSettingsPanel } from "@/components/admin/BusinessSettingsPanel";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getAdminPageData } from "@/lib/admin-dashboard-data";
import { getNewAdminOrdersCount } from "@/lib/admin/getPendingAdminOrders";

const SETTINGS_SECTIONS = new Set([
  "transferencia",
  "contacto",
  "despacho",
  "notificaciones-push",
  "seguridad"
]);

export default async function AdminConfiguracionPage({
  searchParams
}: {
  searchParams: Promise<{ seccion?: string }>;
}) {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/login");
  }

  const { seccion } = await searchParams;
  const initialSection = SETTINGS_SECTIONS.has(seccion ?? "")
    ? (seccion as
        | "transferencia"
        | "contacto"
        | "despacho"
        | "notificaciones-push"
        | "seguridad")
    : "transferencia";

  const initialData = await getAdminPageData();
  const pendingCount = getNewAdminOrdersCount(initialData.dashboard.pendientes);

  return (
    <BusinessSettingsPanel
      initialSection={initialSection}
      pendingCount={pendingCount}
    />
  );
}
