import { AlertTriangle } from "lucide-react";
import type { EntitlementNoticePayload } from "@/lib/entitlements";

/**
 * Banner discreto de entitlement (GRACE_PERIOD, seccion 23 del encargo).
 * Renderiza EXCLUSIVAMENTE texto plano validado por
 * lib/entitlements/schema.ts (nunca innerHTML/dangerouslySetInnerHTML) --
 * el texto de `notice` viene de Control, nunca se inventa aqui. No depende
 * solo del color: usa un icono + texto explicito ("Mensualidad pendiente"),
 * no un punto de color aislado.
 */
export function EntitlementNotice({ notice }: { notice: EntitlementNoticePayload }) {
  return (
    <div role="status" aria-live="polite" className="border-b border-[#f3d9a8] bg-[#fff8ec] px-4 py-3 sm:px-6">
      <div className="mx-auto flex max-w-6xl items-start gap-2.5 text-sm text-[#8a5a00]">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="leading-5">
          <span className="font-semibold">{notice.title}</span>
          {notice.message ? <span className="ml-1.5">{notice.message}</span> : null}
        </p>
      </div>
    </div>
  );
}
