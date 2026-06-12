import { OrderForm } from "@/components/OrderForm";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <section className="overflow-hidden rounded-[28px] border border-border/60 bg-white/90 shadow-soft backdrop-blur">
        <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="bg-[linear-gradient(180deg,#ff7f86_0%,#f28c8f_58%,#fff1ec_100%)] p-6 sm:p-8">
            <div className="space-y-5">
              <span className="inline-flex w-fit rounded-full bg-white/30 px-3 py-1 text-sm font-semibold text-white">
            Pedidos caseros
              </span>
              <div className="space-y-3">
                <h1 className="text-4xl font-bold tracking-normal text-white sm:text-5xl">
                  Pauli Store
                </h1>
                <p className="max-w-2xl text-base leading-7 text-white/88 sm:text-lg">
                  Una experiencia simple para armar pedidos caseros, combinar productos
                  y dejar todo listo para confirmar.
                </p>
              </div>
              <div className="grid gap-3 text-sm text-white/90 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/30 bg-white/16 p-4 backdrop-blur">
                  Catalogo
                  <div className="mt-1 text-xl font-semibold text-white">Multiproducto</div>
                </div>
                <div className="rounded-2xl border border-white/30 bg-white/16 p-4 backdrop-blur">
                  Estado
                  <div className="mt-1 text-xl font-semibold text-white">Pendiente</div>
                </div>
                <div className="rounded-2xl border border-white/30 bg-white/16 p-4 backdrop-blur">
                  Cobro
                  <div className="mt-1 text-xl font-semibold text-white">Sin pago</div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 bg-[#fffaf6] p-6 sm:p-8">
            <div className="rounded-2xl border border-border/70 bg-white px-5 py-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-ink/55">
                Operacion
              </div>
              <div className="mt-2 text-sm leading-6 text-ink/75">
                El cliente arma el carrito, el pedido entra a revision y luego el
                panel admin lo agenda, cobra o deja fiado.
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border/70 bg-white p-4">
                <div className="text-2xl">📦</div>
                <div className="mt-3 text-sm font-semibold text-ink">Pedido guiado</div>
                <div className="mt-1 text-sm leading-6 text-ink/70">
                  Selecciona productos, ajusta cantidades y revisa el total antes de
                  enviar.
                </div>
              </div>
              <div className="rounded-2xl border border-border/70 bg-white p-4">
                <div className="text-2xl">🧾</div>
                <div className="mt-3 text-sm font-semibold text-ink">Seguimiento real</div>
                <div className="mt-1 text-sm leading-6 text-ink/70">
                  El equipo puede confirmar, cobrar, dejar fiado y ajustar el catalogo.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <OrderForm />
    </main>
  );
}
