import { OrderForm } from "@/components/OrderForm";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-col gap-6 overflow-x-hidden px-4 py-4 sm:px-6 lg:gap-8 lg:px-8 lg:py-6">
      <section className="relative overflow-hidden rounded-[38px] border border-[#e3d9c8] bg-white/92 shadow-soft backdrop-blur">
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.05] sm:opacity-[0.08]">
          <span className="font-display text-[7rem] font-semibold tracking-tight text-[#231f19] sm:text-[10rem]">
            S.
          </span>
        </div>
        <div className="relative bg-[linear-gradient(140deg,#faf7f1_0%,#f2ece0_48%,#f2ece0_100%)] p-6 sm:p-8">
          <div className="space-y-7">
            <div className="space-y-5">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/70 bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#6b4a26] shadow-[0_12px_24px_rgba(35,31,25,0.06)]">
                Perfumes y fragancias exclusivas
              </div>
              <div className="flex items-center gap-4">
                <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-[20px] bg-[#231f19] shadow-[0_12px_24px_rgba(35,31,25,0.18)]">
                  <span className="font-display text-2xl font-semibold text-[#faf7f1]">S</span>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[#6b4a26]">
                    Smellme.cl
                  </div>
                  <h1 className="font-display text-[2.75rem] font-semibold leading-[0.95] text-[#231f19] sm:text-5xl">
                    Tu vitrina de perfumes
                  </h1>
                </div>
              </div>
              <p className="max-w-2xl text-base leading-7 text-[#74695c] sm:text-lg">
                Descubre perfumes originales, testers y fragancias exclusivas a precio
                conveniente. Catálogo curado, stock real y despacho coordinado directo
                contigo.
              </p>
            </div>

            <div className="grid gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-[24px] border border-white/60 bg-white/65 p-4 text-[#74695c] backdrop-blur">
                Catálogo
                <div className="mt-1 text-lg font-semibold text-[#231f19]">Top 10 y ofertas</div>
              </div>
              <div className="rounded-[24px] border border-white/60 bg-white/65 p-4 text-[#74695c] backdrop-blur">
                Despacho
                <div className="mt-1 text-lg font-semibold text-[#231f19]">
                  Previa coordinación
                </div>
              </div>
              <div className="rounded-[24px] border border-white/60 bg-[#9c7a45] p-4 text-white shadow-[0_16px_30px_rgba(156,122,69,0.2)]">
                Confirmación
                <div className="mt-1 text-lg font-semibold">Por WhatsApp</div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 pt-1">
              <a
                href="#hacer-pedido"
                className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#9c7a45] px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_30px_rgba(156,122,69,0.2)] transition hover:bg-[#6b4a26]"
              >
                Ver catálogo
              </a>
              <a
                href="#pedido-form"
                className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-[#e3d9c8] bg-white/85 px-5 py-3 text-sm font-semibold text-[#231f19] transition hover:border-[#9c7a45] hover:text-[#6b4a26]"
              >
                Ir a mis datos
              </a>
            </div>
          </div>
        </div>
      </section>

      <OrderForm />
    </main>
  );
}
