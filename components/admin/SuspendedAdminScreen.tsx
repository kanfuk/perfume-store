import { ShieldAlert } from "lucide-react";
import { SmellmeMonogram } from "@/components/SmellmeBrand";
import { EntitlementNotice } from "@/components/admin/EntitlementNotice";
import type { EntitlementNoticePayload } from "@/lib/entitlements";

type SuspendedAdminScreenVariant = "suspended" | "configuration-error";

const COPY: Record<SuspendedAdminScreenVariant, { title: string; description: string }> = {
  suspended: {
    title: "Acceso administrativo temporalmente suspendido",
    description:
      "El acceso administrativo se encuentra temporalmente suspendido. Regulariza el estado del servicio para recuperar el acceso."
  },
  "configuration-error": {
    title: "Acceso administrativo temporalmente no disponible",
    description: "Existe un problema de configuración del servicio. Contacta al administrador del sistema."
  }
};

/**
 * Pantalla profesional de admin bloqueado (seccion 25 del encargo, mas el
 * patch de seguridad sobre configuracion Production ausente). Dos variantes
 * de copy fijo, ambas con la MISMA garantia: NUNCA muestran monto de deuda,
 * payment references, client IDs, subscription IDs, tokens, nombre de la
 * variable de entorno faltante, URL interna, stack trace, ni ningun detalle
 * interno de Control.
 *
 * - "suspended": Control respondio DENY autoritativo (SUSPENDED/CANCELLED)
 *   o el token es invalido/revocado (401) -- hay integracion real y una
 *   decision (o falta de credencial) que resolver del lado comercial.
 * - "configuration-error": Production no tiene el installation
 *   token/URL configurados. NO es una decision de Control -- es un error de
 *   configuracion de Perfume Store, y se comunica como tal para no
 *   confundir a nadie con una suspension comercial que no ocurrio.
 *
 * No cierra sesion (seccion 26): el layout que renderiza esta pantalla
 * (app/admin/layout.tsx) no toca cookies ni Supabase Auth, solo deja de
 * mostrar el contenido protegido hasta que el siguiente check autoritativo
 * (recheckAfterSeconds) confirme ALLOW, o hasta que se corrija la config.
 */
export function SuspendedAdminScreen({
  notice,
  variant = "suspended"
}: {
  notice?: EntitlementNoticePayload | null;
  variant?: SuspendedAdminScreenVariant;
}) {
  const copy = COPY[variant];

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#f7f1e8] px-6 py-12 text-center">
      <div className="flex items-center gap-3">
        <SmellmeMonogram className="h-10 w-10" />
        <span className="text-sm font-semibold text-[#191714]">Smellme.cl</span>
      </div>

      <div className="mt-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fdf1ef] text-[#8a2c22]">
        <ShieldAlert className="h-7 w-7" aria-hidden="true" />
      </div>

      <h1 className="mt-6 max-w-lg text-2xl font-bold text-[#191714]">{copy.title}</h1>
      <p className="mt-3 max-w-md text-sm leading-6 text-[#6B6258]">{copy.description}</p>

      {notice ? (
        <div className="mt-6 w-full max-w-md overflow-hidden rounded-2xl border border-[#DDD0C1]">
          <EntitlementNotice notice={notice} />
        </div>
      ) : null}

      <p className="mt-10 text-xs text-[#8C8175]">Riedmann Apps</p>
    </main>
  );
}
