import { OrderForm } from "@/components/OrderForm";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-4 sm:px-6 lg:gap-8 lg:px-8 lg:py-6">
      <section className="overflow-hidden rounded-[34px] border border-[#f0d6da] bg-white/92 shadow-soft backdrop-blur">
        <div className="bg-[linear-gradient(180deg,#ff9fb3_0%,#f7b4bf_46%,#fff2f4_100%)] p-6 sm:p-8">
          <div className="space-y-6">
            <span className="inline-flex w-fit rounded-full bg-white/40 px-3 py-1 text-sm font-semibold text-[#8f4156]">
              Pedidos caseros
            </span>
            <div className="space-y-3">
              <h1 className="text-4xl font-bold tracking-normal text-[#6f3146] sm:text-5xl">
                Pauli Store
              </h1>
              <p className="max-w-2xl text-base leading-7 text-[#7e4a5c] sm:text-lg">
                Pancitos, queques y cositas ricas hechas con dedicacion para alegrar
                la oficina, la casa o un regalo bonito de ultimo minuto.
              </p>
            </div>

            <div className="grid gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-[22px] border border-white/50 bg-white/45 p-4 text-[#7a4256] backdrop-blur">
                Hecho hoy
                <div className="mt-1 text-xl font-semibold text-[#6f3146]">
                  Fresquito
                </div>
              </div>
              <div className="rounded-[22px] border border-white/50 bg-white/45 p-4 text-[#7a4256] backdrop-blur">
                Pedido
                <div className="mt-1 text-xl font-semibold text-[#6f3146]">
                  Facil y rapido
                </div>
              </div>
              <div className="rounded-[22px] border border-white/50 bg-white/45 p-4 text-[#7a4256] backdrop-blur">
                Entrega
                <div className="mt-1 text-xl font-semibold text-[#6f3146]">
                  Coordinada
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 pt-1">
              <a
                href="#hacer-pedido"
                className="inline-flex items-center justify-center rounded-2xl bg-[#b85f79] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#a8526c]"
              >
                Hacer pedido ahora
              </a>
              <span className="inline-flex items-center rounded-2xl border border-white/50 bg-white/45 px-4 py-3 text-sm font-medium text-[#7a4256]">
                Varios productos en un solo pedido
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="inline-flex rounded-full bg-white/55 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[#8f4156]">
                1. Elige
              </span>
              <span className="inline-flex rounded-full bg-white/55 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[#8f4156]">
                2. Deja tus datos
              </span>
              <span className="inline-flex rounded-full bg-white/55 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[#8f4156]">
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
