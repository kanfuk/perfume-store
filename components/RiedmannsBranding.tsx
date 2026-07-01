"use client";

import Image from "next/image";
import { MessageCircle } from "lucide-react";
import { getRiedmannsWhatsAppNumber } from "@/lib/env";

type RiedmannsBrandingProps = {
  variant?: "client" | "admin";
  className?: string;
};

const RIEDMANNS_DISPLAY_PHONE = "+56 9 9434 8554";

export function RiedmannsBranding({
  variant = "client",
  className = ""
}: RiedmannsBrandingProps) {
  const whatsappNumber = getRiedmannsWhatsAppNumber();
  const whatsappUrl = whatsappNumber
    ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
        "Hola, vi Pauli Store y quiero digitalizar mi PYME con RiedmannsApps."
      )}`
    : "";

  if (variant === "admin") {
    return (
      <div
        className={`inline-flex w-full items-center justify-center gap-2 py-4 text-[0.78rem] text-[rgba(20,63,56,0.55)] ${className}`.trim()}
      >
        <span className="relative h-[18px] w-[18px] overflow-hidden rounded-[0.35rem]">
          <Image
            src="/brand/ra-logo-original.png"
            alt="RiedmannsApps"
            fill
            className="object-cover"
          />
        </span>
        <span>RiedmannsApps · Todos los derechos reservados.</span>
      </div>
    );
  }

  return (
    <section
      className={`mx-auto w-full max-w-[720px] rounded-[28px] border border-[rgba(120,80,140,0.16)] bg-[radial-gradient(circle_at_top_right,rgba(236,120,220,0.14),transparent_32%),linear-gradient(135deg,rgba(255,255,255,0.94),rgba(242,255,249,0.9))] p-4 shadow-[0_18px_40px_rgba(16,80,60,0.08)] ${className}`.trim()}
    >
      <div className="flex items-center gap-3">
        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-[0.9rem] shadow-[0_8px_18px_rgba(70,30,90,0.16)]">
          <Image
            src="/brand/ra-logo-original.png"
            alt="RiedmannsApps"
            fill
            className="object-cover"
          />
        </div>
        <div className="min-w-0">
          <p className="m-0 text-[0.72rem] font-extrabold uppercase tracking-[0.12em] text-[rgba(32,80,70,0.72)]">
            ¿Quieres digitalizar tu PYME?
          </p>
          <h3 className="m-[0.15rem_0_0] text-[1.05rem] font-black text-[#143f38]">
            RiedmannsApps
          </h3>
          <p className="m-[0.2rem_0_0] text-[0.84rem] leading-[1.35] text-[rgba(20,63,56,0.72)]">
            Automatización, ventas y experiencia digital para pequeños negocios.
          </p>
        </div>
      </div>

      {whatsappUrl ? (
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={`Hablemos por WhatsApp con RiedmannsApps al ${RIEDMANNS_DISPLAY_PHONE}`}
          className="mt-4 inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#143f38,#1aa37a)] px-4 py-3 text-[0.9rem] font-extrabold text-white shadow-[0_12px_24px_rgba(20,120,90,0.18)] transition hover:opacity-95"
        >
          <MessageCircle className="h-4 w-4" />
          <span className="sm:hidden">WhatsApp</span>
          <span className="hidden sm:inline">Hablemos por WhatsApp</span>
        </a>
      ) : null}

      <p className="m-[0.85rem_0_0] text-center text-[0.74rem] text-[rgba(20,63,56,0.58)]">
        RiedmannsApps · Todos los derechos reservados.
      </p>
    </section>
  );
}
