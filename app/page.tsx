import { OrderForm } from "@/components/OrderForm";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <section className="grid gap-5 rounded-[24px] border border-border/70 bg-white/92 p-6 shadow-soft backdrop-blur sm:p-8 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-5">
          <span className="inline-flex w-fit rounded-full bg-secondary/90 px-3 py-1 text-sm font-semibold text-ink">
            Pedidos caseros
          </span>
          <div className="space-y-3">
            <h1 className="text-4xl font-bold tracking-normal text-ink sm:text-5xl">
              Pauli Store
            </h1>
            <p className="max-w-2xl text-base leading-7 text-ink/80 sm:text-lg">
              Registra pedidos de productos caseros en una sola pasada, combina
              varios productos y deja el detalle listo para confirmacion.
            </p>
          </div>
          <div className="grid gap-3 text-sm text-ink/75 sm:grid-cols-3">
            <div className="rounded-xl border border-border/80 bg-background/80 p-4">
              Catalogo activo
              <div className="mt-1 text-xl font-semibold text-ink">Multiproducto</div>
            </div>
            <div className="rounded-xl border border-border/80 bg-background/80 p-4">
              Flujo inicial
              <div className="mt-1 text-xl font-semibold text-ink">Pendiente</div>
            </div>
            <div className="rounded-xl border border-border/80 bg-background/80 p-4">
              Cobro inicial
              <div className="mt-1 text-xl font-semibold text-ink">Sin pago</div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 rounded-[20px] border border-border/70 bg-background/70 p-5">
          <div>
            <div className="text-sm font-semibold uppercase tracking-wide text-ink/55">
              Operacion
            </div>
            <p className="mt-2 text-sm leading-6 text-ink/75">
              El cliente arma el carrito, el pedido entra a revision y luego el
              panel admin lo agenda, cobra o deja fiado.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border/70 bg-white px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-ink/55">
                Clientes
              </div>
              <div className="mt-2 text-sm text-ink/75">
                Un solo formulario para pedidos rapidos y claros.
              </div>
            </div>
            <div className="rounded-xl border border-border/70 bg-white px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-ink/55">
                Admin
              </div>
              <div className="mt-2 text-sm text-ink/75">
                Seguimiento de agenda, pagos, fiados y cierre.
              </div>
            </div>
          </div>
        </div>
      </section>

      <OrderForm />
    </main>
  );
}
