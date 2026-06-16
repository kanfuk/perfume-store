import { OrderForm } from "@/components/OrderForm";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-4 sm:px-6 lg:gap-8 lg:px-8 lg:py-6">
      <section className="overflow-hidden rounded-[34px] border border-[#f0d6da] bg-white/92 shadow-soft backdrop-blur">
        <div className="grid gap-0 lg:grid-cols-[1.12fr_0.88fr]">
          <div className="bg-[linear-gradient(180deg,#ff9fb3_0%,#f7b4bf_46%,#fff2f4_100%)] p-6 sm:p-8">
            <div className="space-y-5">
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
                <div className="rounded-2xl border border-white/50 bg-white/45 p-4 text-[#7a4256] backdrop-blur">
                  Hecho hoy
                  <div className="mt-1 text-xl font-semibold text-[#6f3146]">
                    Fresquito
                  </div>
                </div>
                <div className="rounded-2xl border border-white/50 bg-white/45 p-4 text-[#7a4256] backdrop-blur">
                  Pedido
                  <div className="mt-1 text-xl font-semibold text-[#6f3146]">
                    Facil y rapido
                  </div>
                </div>
                <div className="rounded-2xl border border-white/50 bg-white/45 p-4 text-[#7a4256] backdrop-blur">
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
            </div>
          </div>

          <div className="grid gap-4 bg-[#fff8fa] p-6 sm:p-8">
            <div className="rounded-[26px] border border-[#f2d9df] bg-white px-5 py-5 shadow-soft">
              <div className="text-xs font-semibold uppercase tracking-wide text-[#a46c7c]">
                Lo importante
              </div>
              <div className="mt-3 text-2xl font-semibold text-[#5f3041]">
                Pide primero. Nosotros coordinamos despues.
              </div>
              <p className="mt-3 text-sm leading-6 text-[#7f5b67]">
                La idea es simple: eliges tus productos, armas tu carrito y nos dejas
                tus datos al final. Nada de vueltas innecesarias.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[24px] border border-[#f2d9df] bg-white p-4">
                <div className="inline-flex rounded-full bg-[#fff0f4] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#b85f79]">
                  Dulce detalle
                </div>
                <div className="mt-3 text-sm font-semibold text-[#5f3041]">
                  Ideal para oficina o regalo
                </div>
                <div className="mt-1 text-sm leading-6 text-[#7f5b67]">
                  Una compra simple, cercana y con ese toque hecho en casa.
                </div>
              </div>

              <div className="rounded-[24px] border border-[#f2d9df] bg-white p-4">
                <div className="inline-flex rounded-full bg-[#fff0f4] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#b85f79]">
                  Encargo facil
                </div>
                <div className="mt-3 text-sm font-semibold text-[#5f3041]">
                  Carrito claro y rapido
                </div>
                <div className="mt-1 text-sm leading-6 text-[#7f5b67]">
                  Primero escoges, despues ajustas cantidades y cierras el pedido.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <OrderForm />

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-[24px] border border-[#f2d9df] bg-white/92 p-4 shadow-soft">
          <div className="text-xs font-semibold uppercase tracking-wide text-[#a46c7c]">
            Encargos
          </div>
          <div className="mt-2 text-base font-semibold text-[#5f3041]">
            Para compartir o sorprender
          </div>
          <div className="mt-1 text-sm leading-6 text-[#7f5b67]">
            Perfecto para la oficina, una once especial o un regalo con cariño.
          </div>
        </div>
        <div className="rounded-[24px] border border-[#f2d9df] bg-white/92 p-4 shadow-soft">
          <div className="text-xs font-semibold uppercase tracking-wide text-[#a46c7c]">
            Preparacion
          </div>
          <div className="mt-2 text-base font-semibold text-[#5f3041]">
            Casero y bien presentado
          </div>
          <div className="mt-1 text-sm leading-6 text-[#7f5b67]">
            Productos ricos, cercanos y con una presentacion que se siente especial.
          </div>
        </div>
        <div className="rounded-[24px] border border-[#f2d9df] bg-white/92 p-4 shadow-soft">
          <div className="text-xs font-semibold uppercase tracking-wide text-[#a46c7c]">
            Coordinacion
          </div>
          <div className="mt-2 text-base font-semibold text-[#5f3041]">
            Te confirmamos directo
          </div>
          <div className="mt-1 text-sm leading-6 text-[#7f5b67]">
            Recibimos tu pedido y coordinamos contigo la mejor forma de entrega.
          </div>
        </div>
      </section>
    </main>
  );
}
