import { OrderForm } from "@/components/OrderForm";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <section className="grid gap-4 rounded-lg border border-border bg-panel p-6 shadow-soft sm:p-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <span className="inline-flex w-fit rounded-full bg-secondary px-3 py-1 text-sm font-semibold text-ink">
            Pedidos caseros
          </span>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-normal text-ink sm:text-4xl">
              Pauli Store
            </h1>
            <p className="max-w-2xl text-base leading-7 text-ink/80">
              Bienvenido a Pauli Store. Registra tu pedido de productos caseros
              de forma rapida y simple.
            </p>
          </div>
          <div className="grid gap-3 text-sm text-ink/75 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-background p-4">
              Productos activos
              <div className="mt-1 text-xl font-semibold text-ink">3</div>
            </div>
            <div className="rounded-lg border border-border bg-background p-4">
              Estado inicial
              <div className="mt-1 text-xl font-semibold text-ink">
                PENDIENTE
              </div>
            </div>
            <div className="rounded-lg border border-border bg-background p-4">
              Pago inicial
              <div className="mt-1 text-xl font-semibold text-ink">
                SIN_PAGO
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-background p-5">
          <p className="text-sm leading-6 text-ink/75">
            Esta primera iteracion trabaja con productos mock y prepara la base
            para Supabase, panel administrador y reglas de negocio completas.
          </p>
        </div>
      </section>

      <OrderForm />
    </main>
  );
}
