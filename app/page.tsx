import { OrderForm } from "@/components/OrderForm";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-4 sm:px-6 lg:gap-8 lg:px-8 lg:py-6">
      <section className="overflow-hidden rounded-[34px] border border-[#ecd7b3] bg-white/92 shadow-soft backdrop-blur">
        <div className="bg-[linear-gradient(140deg,#fff4da_0%,#f8d8cb_48%,#fdecef_100%)] p-6 sm:p-8">
          <div className="space-y-6">
            <span className="inline-flex w-fit rounded-full bg-white/70 px-3 py-1 text-sm font-semibold text-[#8f5728]">
              Desayunos caseros del dia
            </span>
            <div className="space-y-3">
              <h1 className="text-4xl font-bold tracking-normal text-[#6f3146] sm:text-5xl">
                Pauli Store
              </h1>
              <p className="max-w-2xl text-base leading-7 text-[#7e4a5c] sm:text-lg">
                Volvieron sus desayunos favoritos. Dobladitas caseras recien
                horneadas para comenzar bien el dia.
              </p>
            </div>

            <div className="grid gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-[22px] border border-white/60 bg-white/55 p-4 text-[#7a4256] backdrop-blur">
                Horneado hoy
                <div className="mt-1 text-xl font-semibold text-[#6f3146]">
                  Fresquito
                </div>
              </div>
              <div className="rounded-[22px] border border-white/60 bg-white/55 p-4 text-[#7a4256] backdrop-blur">
                Pedido
                <div className="mt-1 text-xl font-semibold text-[#6f3146]">
                  Facil y rapido
                </div>
              </div>
              <div className="rounded-[22px] border border-white/60 bg-white/55 p-4 text-[#7a4256] backdrop-blur">
                Entrega
                <div className="mt-1 text-xl font-semibold text-[#6f3146]">
                  Coordinada
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 pt-1">
              <a
                href="#hacer-pedido"
                className="inline-flex items-center justify-center rounded-2xl bg-[#a86b32] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#8f5728]"
              >
                Registrar mi pedido
              </a>
              <span className="inline-flex items-center rounded-2xl border border-white/50 bg-white/55 px-4 py-3 text-sm font-medium text-[#7a4256]">
                Pide en menos de un minuto desde tu celu
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="inline-flex rounded-full bg-white/65 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[#8f4156]">
                1. Elige tu dobladita
              </span>
              <span className="inline-flex rounded-full bg-white/65 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[#8f4156]">
                2. Deja tus datos
              </span>
              <span className="inline-flex rounded-full bg-white/65 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[#8f4156]">
                3. Confirmamos por WhatsApp
              </span>
            </div>
          </div>
        </div>
      </section>

      <OrderForm />
    </main>
  );
}
