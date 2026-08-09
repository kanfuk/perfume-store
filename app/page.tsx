import Image from "next/image";
import { ArrowDown, ArrowRight, Sparkles } from "lucide-react";
import { OrderForm } from "@/components/OrderForm";

export default function HomePage() {
  return (
    <main className="min-h-[100dvh] w-full overflow-x-hidden bg-[#f7f1e8]">
      <section className="relative isolate overflow-hidden bg-[#0b0b0b] text-[#f7f1e8]">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_80%_18%,rgba(203,148,120,0.22),transparent_30%),radial-gradient(circle_at_12%_90%,rgba(184,139,88,0.14),transparent_34%)]" />
        <div className="absolute inset-0 -z-20 opacity-35 [background-image:linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)] [background-size:42px_42px]" />

        <div className="mx-auto max-w-7xl px-5 pb-12 pt-4 sm:px-8 lg:pb-16">
          <nav className="flex min-h-16 items-center justify-between border-b border-[#e8c79e]/15 py-3">
            <a href="#" className="flex items-center gap-3" aria-label="Smellme.cl, inicio">
              <span className="relative h-11 w-11 overflow-hidden rounded-xl border border-[#e8c79e]/25 bg-[#101010] shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
                <Image src="/brand/smellme-monogram.webp" alt="" fill sizes="44px" className="object-cover" priority />
              </span>
              <span className="text-base font-semibold tracking-[0.01em] text-[#f7f1e8]">Smellme.cl</span>
            </a>
            <a href="#como-comprar" className="text-sm font-medium text-[#e8ded0]/75 transition hover:text-[#e8c79e]">
              Cómo comprar
            </a>
          </nav>

          <div className="grid items-center gap-8 pb-2 pt-10 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.78fr)] lg:gap-14 lg:pt-14">
            <div className="max-w-3xl">
              <div className="mb-5 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-[#e8c79e]">
                <Sparkles className="h-4 w-4" />
                Perfumería boutique
              </div>
              <h1 className="max-w-3xl text-[clamp(2.75rem,7vw,6rem)] font-semibold leading-[0.93] tracking-[-0.055em] text-[#f7f1e8]">
                Tu próxima fragancia, elegida con intención.
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-[#e8ded0]/70 sm:text-lg">
                Perfumes, testers y selecciones especiales con atención cercana y despacho coordinado.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a href="#catalogo-section" className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-[14px] bg-[linear-gradient(135deg,#e8c79e,#cb9478)] px-6 text-sm font-bold text-[#191714] shadow-[0_12px_28px_rgba(113,75,45,0.3)] transition hover:-translate-y-0.5 hover:brightness-105">
                  Explorar catálogo <ArrowDown className="h-4 w-4" />
                </a>
                <a href="#como-comprar" className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-[14px] border border-[#e8c79e]/25 bg-white/[0.03] px-6 text-sm font-semibold text-[#f7f1e8] transition hover:border-[#e8c79e]/50 hover:bg-white/[0.07]">
                  Cómo comprar <ArrowRight className="h-4 w-4" />
                </a>
              </div>
            </div>

            <div className="relative mx-auto h-[290px] w-full max-w-[390px] sm:h-[350px] lg:h-[410px]" aria-label="Identidad oficial Smellme.cl">
              <div className="absolute inset-5 rounded-[30px] bg-[#cb9478]/12 blur-3xl" />
              <div className="absolute inset-0 overflow-hidden rounded-[28px] border border-[#e8c79e]/20 bg-[#101010] shadow-[0_34px_90px_rgba(0,0,0,0.5)]">
                <Image src="/brand/smellme-brand-dark.webp" alt="Logo oficial SML Smellme.cl" fill sizes="(max-width: 1024px) 390px, 410px" className="object-cover" priority />
                <div className="absolute inset-0 ring-1 ring-inset ring-white/5" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-8 lg:py-14">
        <OrderForm />
      </div>
    </main>
  );
}
