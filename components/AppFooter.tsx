import Image from "next/image";
import { getRiedmannsWhatsAppUrl } from "@/lib/env";

type AppFooterProps = {
  className?: string;
  showClientCta?: boolean;
};

export function AppFooter({
  className = "",
  showClientCta = false
}: AppFooterProps) {
  const riedmannsWhatsAppUrl = getRiedmannsWhatsAppUrl();

  return (
    <footer
      className={`space-y-4 py-6 text-center text-xs text-[#8b6a74] ${className}`.trim()}
    >
      {showClientCta && riedmannsWhatsAppUrl ? (
        <div className="mx-auto max-w-lg rounded-[28px] border border-[#d9e6ef] bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(236,246,255,0.92))] px-5 py-4 text-left shadow-[0_18px_38px_rgba(31,51,40,0.08)]">
          <a
            href={riedmannsWhatsAppUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between gap-4 rounded-[22px] transition hover:opacity-95"
          >
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#56738a]">
                ¿Quieres digitalizar tu PYME?
              </div>
              <div className="mt-1 text-[15px] font-semibold text-[#204b68] sm:text-base">
                Desarrollado por RiedmannsApps
              </div>
              <div className="mt-1 text-xs text-[#6f8798]">
                Automatización, ventas y experiencia digital con presencia sutil.
              </div>
            </div>
            <span className="flex shrink-0 items-center gap-2 rounded-full border border-[#d7e7f5] bg-white/90 px-2.5 py-2 shadow-[0_10px_20px_rgba(32,75,104,0.08)]">
              <span className="relative h-7 w-7 overflow-hidden rounded-[10px]">
                <Image
                  src="/brand/ra-logo.svg"
                  alt="RiedmannsApps"
                  fill
                  className="object-contain"
                />
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#315d7a]">
                RA
              </span>
            </span>
          </a>
        </div>
      ) : null}

      <div className="flex items-center justify-center gap-2 text-[#6f7f75]">
        <span className="relative h-5 w-5 overflow-hidden rounded-[8px] opacity-75">
          <Image
            src="/brand/ra-logo.svg"
            alt="RiedmannsApps"
            fill
            className="object-contain"
          />
        </span>
        <span className="text-[12px] font-medium tracking-[0.01em]">
          RiedmannsApps · Todos los derechos reservados.
        </span>
      </div>
    </footer>
  );
}
