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
      className={`space-y-3 py-6 text-center text-xs text-[#8b6a74] ${className}`.trim()}
    >
      {showClientCta && riedmannsWhatsAppUrl ? (
        <div className="mx-auto flex max-w-md flex-col items-center gap-1 rounded-[20px] border border-[#d8ebdd] bg-white/70 px-4 py-3 text-[#6b7c70] shadow-[0_10px_24px_rgba(31,51,40,0.05)]">
          <span className="text-[11px] uppercase tracking-[0.16em] text-[#7b8e82]">
            ¿Quieres digitalizar tu pyme?
          </span>
          <a
            href={riedmannsWhatsAppUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#247a4d] transition hover:text-[#1d5f3c]"
          >
            <span>Desarrollado por RiedmannsApps</span>
            <span className="relative h-[18px] w-[18px] overflow-hidden rounded-[7px] opacity-70">
              <Image
                src="/brand/ra-logo.svg"
                alt="RiedmannsApps"
                fill
                className="object-contain"
              />
            </span>
          </a>
        </div>
      ) : null}

      <div className="flex items-center justify-center gap-2 text-[#8b6a74]">
        <span className="relative h-5 w-5 overflow-hidden rounded-[8px] opacity-60">
          <Image
            src="/brand/ra-logo.svg"
            alt="RiedmannsApps"
            fill
            className="object-contain"
          />
        </span>
        <span>RiedmannsApps · Todos los derechos reservados.</span>
      </div>
    </footer>
  );
}
