import { redirect } from "next/navigation";
import { BusinessSettingsPanel } from "@/components/admin/BusinessSettingsPanel";
import { isAdminAuthenticated } from "@/lib/admin-auth";

const SETTINGS_SECTIONS = new Set([
  "transferencia",
  "contacto",
  "despacho",
  "notificaciones",
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
        | "notificaciones"
        | "seguridad")
    : "transferencia";

  return <BusinessSettingsPanel initialSection={initialSection} />;
}
