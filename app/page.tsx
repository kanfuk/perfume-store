import { OrderForm } from "@/components/OrderForm";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-4 sm:px-6 lg:gap-8 lg:px-8 lg:py-6">
      <section className="overflow-hidden rounded-[32px] border border-border/60 bg-white/92 shadow-soft backdrop-blur">
        <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="bg-[linear-gradient(180deg,#ff7f86_0%,#f28c8f_58%,#fff1ec_100%)] p-6 sm:p-8">
            <div className="space-y-5">
              <span className="inline-flex w-fit rounded-full bg-white/30 px-3 py-1 text-sm font-semibold text-white">
                Hecho en casa
              </span>
              <div className="space-y-3">
                <h1 className="text-4xl font-bold tracking-normal text-white sm:text-5xl">
                  Pauli Store
                </h1>
                <p className="max-w-2xl text-base leading-7 text-white/88 sm:text-lg">
                  Panes, queques y detalles caseros preparados con dedicacion para
                  compartir en la oficina, en casa o en una once especial.
                </p>
              </div>
              <div className="grid gap-3 text-sm text-white/90 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/30 bg-white/16 p-4 backdrop-blur">
                  Preparacion
                  <div className="mt-1 text-xl font-semibold text-white">
                    Fresca del dia
                  </div>
                </div>
                <div className="rounded-2xl border border-white/30 bg-white/16 p-4 backdrop-blur">
                  Pedidos
                  <div className="mt-1 text-xl font-semibold text-white">
                    A tu medida
                  </div>
                </div>
                <div className="rounded-2xl border border-white/30 bg-white/16 p-4 backdrop-blur">
                  Entrega
                  <div className="mt-1 text-xl font-semibold text-white">
                    Coordinada contigo
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 bg-[#fffaf6] p-6 sm:p-8">
            <div className="rounded-2xl border border-border/70 bg-white px-5 py-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-ink/55">
                Nuestra propuesta
              </div>
              <div className="mt-2 text-sm leading-6 text-ink/75">
                Productos caseros con ese toque cercano que hace mas rica una reunion,
                una pausa de oficina o un regalo simple pero bien pensado.
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border/70 bg-white p-4">
                <div className="inline-flex rounded-full bg-[#fff4eb] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
                  Seleccion diaria
                </div>
                <div className="mt-3 text-sm font-semibold text-ink">
                  Sabores que acompanan
                </div>
                <div className="mt-1 text-sm leading-6 text-ink/70">
                  Elige panes, queques o packs para compartir, regalar o darte un
                  gusto.
                </div>
              </div>
              <div className="rounded-2xl border border-border/70 bg-white p-4">
                <div className="inline-flex rounded-full bg-[#fff4eb] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
                  Pedido simple
                </div>
                <div className="mt-3 text-sm font-semibold text-ink">
                  Coordinacion simple
                </div>
                <div className="mt-1 text-sm leading-6 text-ink/70">
                  Registra tu pedido en minutos y te lo confirmamos con calma y
                  orden.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border/60 bg-white/92 p-4 shadow-soft">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink/55">
            Paso 1
          </div>
          <div className="mt-2 text-base font-semibold text-ink">
            Cuentanos para quien es
          </div>
          <div className="mt-1 text-sm leading-6 text-ink/70">
            Dejanos tu nombre, contacto y lugar para coordinar sin vueltas.
          </div>
        </div>
        <div className="rounded-2xl border border-border/60 bg-white/92 p-4 shadow-soft">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink/55">
            Paso 2
          </div>
          <div className="mt-2 text-base font-semibold text-ink">
            Elige lo que se te antoje
          </div>
          <div className="mt-1 text-sm leading-6 text-ink/70">
            Mezcla panes, queques y packs en un solo pedido.
          </div>
        </div>
        <div className="rounded-2xl border border-border/60 bg-white/92 p-4 shadow-soft">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink/55">
            Paso 3
          </div>
          <div className="mt-2 text-base font-semibold text-ink">
            Nosotros lo coordinamos
          </div>
          <div className="mt-1 text-sm leading-6 text-ink/70">
            Recibimos tu pedido y te confirmamos la mejor forma de entrega.
          </div>
        </div>
      </section>

      <OrderForm />
    </main>
  );
}
