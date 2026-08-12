import { ShieldAlert } from "lucide-react";
import { SmellmeMonogram } from "@/components/SmellmeBrand";
import { EntitlementNotice } from "@/components/admin/EntitlementNotice";
import type { EntitlementNoticePayload } from "@/lib/entitlements";

type SuspendedAdminScreenVariant = "suspended" | "technical";

const WHATSAPP_MESSAGE =
  "Hola, necesito regularizar la mensualidad de mi aplicación para reactivar el acceso administrativo.";
const WHATSAPP_URL = `https://wa.me/56994348554?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`;

const COPY: Record<SuspendedAdminScreenVariant, { title: string; description: string }> = {
  suspended: {
    title: "Acceso administrativo suspendido",
    description:
      "Tu acceso al panel administrativo se encuentra temporalmente suspendido por una situación pendiente con el servicio."
  },
  technical: {
    title: "Acceso administrativo temporalmente no disponible",
    description: "Existe un problema de configuración o disponibilidad del servicio. Contacta a Riedmann Apps."
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
 * - "suspended": Control respondio DENY autoritativo con status SUSPENDED.
 * - "technical": cualquier otro bloqueo (CANCELLED, token invalido,
 *   configuracion ausente u otro fail-closed) usa copy neutral, sin afirmar
 *   deuda ni solicitar un pago.
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

      {variant === "suspended" ? (
        <>
          <p className="mt-6 max-w-md rounded-2xl border border-[#D8C5AE] bg-white/70 px-5 py-4 text-sm font-semibold leading-6 text-[#4D3528] shadow-sm">
            Actualiza tu situación de pago para reactivar el acceso.
          </p>
          <p className="mt-4 max-w-md text-sm leading-6 text-[#6B6258]">
            Tus datos, catálogo y tienda pública se mantienen disponibles.
          </p>
          <div className="mt-7 flex w-full max-w-md flex-col gap-3 sm:flex-row sm:justify-center">
            <a
              className="rounded-xl bg-[#191714] px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#352f29] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#191714]"
              href={WHATSAPP_URL}
              rel="noopener noreferrer"
              target="_blank"
            >
              Regularizar por WhatsApp
            </a>
            <a
              className="rounded-xl border border-[#CDBEAD] bg-white/60 px-5 py-3 text-sm font-semibold text-[#352f29] transition-colors hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6B6258]"
              href="https://riedmannapps.com"
              rel="noopener noreferrer"
              target="_blank"
            >
              Visitar Riedmann Apps
            </a>
          </div>
        </>
      ) : null}

      {notice ? (
        <div className="mt-6 w-full max-w-md overflow-hidden rounded-2xl border border-[#DDD0C1]">
          <EntitlementNotice notice={notice} />
        </div>
      ) : null}

      <p className="mt-10 max-w-md text-xs leading-5 text-[#8C8175]">
        {variant === "suspended"
          ? "Una vez regularizada la situación, el acceso se reactivará automáticamente."
          : "Riedmann Apps"}
      </p>
    </main>
  );
}
