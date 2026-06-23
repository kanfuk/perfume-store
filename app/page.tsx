import Image from "next/image";
import { OrderForm } from "@/components/OrderForm";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-col gap-6 overflow-x-hidden px-4 py-4 sm:px-6 lg:gap-8 lg:px-8 lg:py-6">
      <section className="relative overflow-hidden rounded-[34px] border border-[#d8ebdd] bg-white/92 shadow-soft backdrop-blur">
        <div className="pointer-events-none absolute inset-0 opacity-10 sm:opacity-20">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative h-full w-full max-w-lg opacity-90">
              <Image
                src="/brand/pauli-store-logo-transparent.png"
                alt="Logo Pauli Store"
                fill
                className="object-contain"
                priority
              />
            </div>
          </div>
        </div>
        <div className="relative bg-[linear-gradient(140deg,#f6fcf7_0%,#eaf6ec_48%,#f3faf4_100%)] p-6 sm:p-8">
          <div className="space-y-6">
            <div className="space-y-3">
              <h1 className="text-4xl font-bold tracking-normal text-[#1f3328] sm:text-5xl">
                Pauli Store
              </h1>
              <p className="copy-justified max-w-2xl text-base leading-7 text-[#6b7c70] sm:text-lg">
                Comienza tu día con algo rico. Disfruta de nuestras ricas
                dobladitas recién horneadas, sabrosos quequitos y otras
                preparaciones caseras, ideales para acompañar tu desayuno o
                darte un gustito.
              </p>
            </div>

            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-[22px] border border-white/60 bg-white/55 p-4 text-[#6b7c70] backdrop-blur">
                Producto casero
                <div className="mt-1 text-xl font-semibold text-[#1f3328]">
                  Recién horneado
                </div>
              </div>
              <div className="rounded-[22px] border border-white/60 bg-white/55 p-4 text-[#6b7c70] backdrop-blur">
                Entrega
                <div className="mt-1 text-xl font-semibold text-[#1f3328]">
                  Previa coordinación
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 pt-1">
              <a
                href="#hacer-pedido"
                className="inline-flex items-center justify-center rounded-2xl bg-[#3fa66b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#247a4d]"
              >
                Registrar mi pedido
              </a>
            </div>
          </div>
        </div>
      </section>

      <OrderForm />
    </main>
  );
}
