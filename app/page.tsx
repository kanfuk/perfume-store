import { ArrowDown, ArrowRight, Sparkles } from "lucide-react";
import { OrderForm } from "@/components/OrderForm";

export default function HomePage() {
  return (
    <main className="min-h-[100dvh] w-full overflow-x-hidden bg-[#f7f8fa]">
      <section className="relative isolate overflow-hidden bg-[#111318] text-white">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_75%_20%,rgba(115,87,255,0.38),transparent_28%),radial-gradient(circle_at_90%_80%,rgba(110,139,255,0.2),transparent_30%)]" />
        <div className="mx-auto max-w-7xl px-5 pb-16 pt-5 sm:px-8 lg:pb-24">
          <nav className="flex items-center justify-between border-b border-white/10 pb-5">
            <a href="#" className="flex items-center gap-3" aria-label="Smellme.cl, inicio">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-base font-bold text-[#111318]">
                S
              </span>
              <span className="text-base font-bold tracking-[-0.02em]">Smellme.cl</span>
            </a>
            <a
              href="#como-comprar"
              className="text-sm font-medium text-white/70 transition hover:text-white"
            >
              Cómo comprar
            </a>
          </nav>

          <div className="grid items-center gap-12 pb-3 pt-14 lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.72fr)] lg:pt-20">
            <div className="max-w-3xl">
              <div className="mb-6 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-[#c8c0ff]">
                <Sparkles className="h-4 w-4" />
                Boutique de fragancias
              </div>
              <h1 className="max-w-3xl text-[clamp(2.9rem,7vw,6.4rem)] font-bold leading-[0.92] tracking-[-0.065em]">
                Encuentra tu próxima fragancia
              </h1>
              <p className="mt-7 max-w-xl text-base leading-7 text-white/65 sm:text-lg">
                Perfumes, testers y ofertas seleccionadas, con despacho coordinado por WhatsApp.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <a
                  href="#catalogo-section"
                  className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-[14px] bg-[#7357ff] px-6 text-sm font-semibold text-white transition hover:bg-[#8068ff]"
                >
                  Explorar catálogo <ArrowDown className="h-4 w-4" />
                </a>
                <a
                  href="#como-comprar"
                  className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-[14px] border border-white/20 px-6 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  Cómo comprar <ArrowRight className="h-4 w-4" />
                </a>
              </div>
            </div>

            <div
              className="relative mx-auto hidden h-[390px] w-full max-w-[410px] lg:block"
              aria-hidden="true"
            >
              <div className="absolute left-1/2 top-1/2 h-[330px] w-[230px] -translate-x-1/2 -translate-y-1/2 rotate-6 rounded-[38px_38px_72px_72px] border border-white/20 bg-[linear-gradient(145deg,rgba(255,255,255,0.22),rgba(115,87,255,0.08))] shadow-[0_40px_100px_rgba(0,0,0,0.35)] backdrop-blur-xl" />
              <div className="absolute left-1/2 top-5 h-16 w-28 -translate-x-1/2 rotate-6 rounded-t-xl border border-white/20 bg-white/10 backdrop-blur" />
              <div className="absolute left-[45%] top-[43%] flex h-28 w-28 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-[#111318]/45 text-4xl font-bold">
                S
              </div>
              <div className="absolute bottom-5 left-0 h-28 w-28 rounded-full bg-[#7357ff]/30 blur-2xl" />
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-8 lg:py-16">
        <OrderForm />
      </div>
    </main>
  );
}
