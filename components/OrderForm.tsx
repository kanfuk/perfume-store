"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCurrency } from "@/lib/format";
import type { CustomerOrderResponse, ProductRecord } from "@/lib/types";
import {
  type CustomerFormData,
  validateCustomerOrderForm
} from "@/lib/validators";

const initialForm: CustomerFormData = {
  nombre: "",
  telefono: "",
  lugarTrabajo: "",
  items: [],
  contactoOculto: ""
};

export function OrderForm() {
  const [form, setForm] = useState<CustomerFormData>(initialForm);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [submitted, setSubmitted] = useState<CustomerOrderResponse | null>(null);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadProducts() {
      try {
        setLoadingProducts(true);
        const response = await fetch("/api/products");
        const data = (await response.json()) as {
          products?: ProductRecord[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(data.error ?? "No fue posible cargar productos.");
        }

        if (!cancelled) {
          setProducts(data.products ?? []);
        }
      } catch (error) {
        if (!cancelled) {
          setServerError(
            error instanceof Error
              ? error.message
              : "No fue posible cargar productos."
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingProducts(false);
        }
      }
    }

    void loadProducts();

    return () => {
      cancelled = true;
    };
  }, []);

  const validation = validateCustomerOrderForm(form, products);

  const cartLines = useMemo(
    () =>
      form.items.map((item) => {
        const product = products.find((current) => current.id === item.productoId);
        return {
          ...item,
          product,
          subtotal: product ? product.precioVenta * item.cantidad : 0
        };
      }),
    [form.items, products]
  );

  const total = cartLines.reduce((sum, item) => sum + item.subtotal, 0);
  const productCount = cartLines.reduce((sum, item) => sum + item.cantidad, 0);

  function addProduct(productId: string) {
    setForm((current) => {
      const existing = current.items.find((item) => item.productoId === productId);

      if (existing) {
        return {
          ...current,
          items: current.items.map((item) =>
            item.productoId === productId
              ? { ...item, cantidad: item.cantidad + 1 }
              : item
          )
        };
      }

      return {
        ...current,
        items: [...current.items, { productoId: productId, cantidad: 1 }]
      };
    });
  }

  function updateQuantity(productId: string, nextQuantity: number) {
    setForm((current) => ({
      ...current,
      items: current.items
        .map((item) =>
          item.productoId === productId ? { ...item, cantidad: nextQuantity } : item
        )
        .filter((item) => item.cantidad > 0)
    }));
  }

  function removeItem(productId: string) {
    setForm((current) => ({
      ...current,
      items: current.items.filter((item) => item.productoId !== productId)
    }));
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setServerError("");

    if (!validation.isValid) {
      setSubmitted(null);
      return;
    }

    try {
      setSubmitting(true);
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(form)
      });

      const data = (await response.json()) as CustomerOrderResponse & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "No fue posible registrar el pedido.");
      }

      setSubmitted(data);
      setForm(initialForm);
    } catch (error) {
      setSubmitted(null);
      setServerError(
        error instanceof Error ? error.message : "No fue posible registrar el pedido."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      id="hacer-pedido"
      className="grid gap-6 scroll-mt-6 pb-24 xl:grid-cols-[1.2fr_0.8fr] xl:pb-0"
    >
      <form
        id="customer-order-form"
        className="space-y-6 rounded-[30px] border border-[#f0d6da] bg-white/95 p-5 shadow-soft backdrop-blur sm:p-6"
        onSubmit={handleSubmit}
      >
        <div className="overflow-hidden rounded-[26px] border border-[#f2d9df] bg-[linear-gradient(180deg,#ffb2c1_0%,#f6c1ca_55%,#fff1f4_100%)] p-5 text-[#6f3146] sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <span className="inline-flex rounded-full bg-white/65 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#8f4156]">
                Haz tu pedido
              </span>
              <h2 className="text-3xl font-bold">Primero eliges, despues confirmas</h2>
              <p className="max-w-xl text-sm leading-6 text-[#7e4a5c]">
                Arma tu carrito arriba, revisa tu total y al final dejas tus datos para
                coordinar contigo.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-center text-sm">
              <div className="rounded-2xl bg-white/65 px-4 py-3 backdrop-blur">
                <div className="text-[#8f6070]">Unidades</div>
                <div className="mt-1 text-lg font-semibold text-[#6f3146]">
                  {productCount}
                </div>
              </div>
              <div className="rounded-2xl bg-white/65 px-4 py-3 backdrop-blur">
                <div className="text-[#8f6070]">Lineas</div>
                <div className="mt-1 text-lg font-semibold text-[#6f3146]">
                  {cartLines.length}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4 rounded-[26px] border border-[#f2d9df] bg-[#fff8fa] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-sm font-semibold uppercase tracking-wide text-[#b85f79] shadow-sm">
                1
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[#5f3041]">
                  Elige tus productos
                </h3>
                <p className="text-sm text-[#7f5b67]">
                  Parte por aqui y agrega al carrito todo lo que quieras llevar.
                </p>
              </div>
            </div>
            {loadingProducts ? (
              <span className="text-sm text-[#8f6070]">Cargando...</span>
            ) : null}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {products.map((product) => {
              const currentItem = form.items.find(
                (item) => item.productoId === product.id
              );

              return (
                <article
                  key={product.id}
                  className="rounded-[24px] border border-[#f2d9df] bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <h4 className="text-base font-semibold text-[#5f3041]">
                        {product.nombre}
                      </h4>
                      <p className="text-sm leading-6 text-[#7f5b67]">
                        {product.descripcion}
                      </p>
                      <div className="inline-flex rounded-full bg-[#fff0f4] px-2.5 py-1 text-xs font-medium text-[#b85f79]">
                        {product.tipoProducto ?? "simple"}
                      </div>
                    </div>
                    {currentItem ? (
                      <span className="rounded-full bg-[#ffe2e9] px-3 py-1 text-xs font-semibold text-[#7b4256]">
                        x{currentItem.cantidad}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-[#b85f79]">
                      {formatCurrency(product.precioVenta)}
                    </div>
                    <button
                      type="button"
                      onClick={() => addProduct(product.id)}
                      className="rounded-2xl bg-[#b85f79] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#a8526c]"
                    >
                      {currentItem ? "Sumar uno" : "Agregar"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          {validation.errors.items ? (
            <p className="text-sm text-danger">{validation.errors.items}</p>
          ) : null}
        </div>

        <div className="space-y-4 rounded-[26px] border border-[#f2d9df] bg-[#fff8fa] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-sm font-semibold uppercase tracking-wide text-[#b85f79] shadow-sm">
                2
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[#5f3041]">Revisa tu carrito</h3>
                <p className="text-sm text-[#7f5b67]">
                  Ajusta cantidades y mira altiro cuanto llevas.
                </p>
              </div>
            </div>
            <div className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-[#5f3041] shadow-sm">
              {formatCurrency(total)}
            </div>
          </div>

          {cartLines.length === 0 ? (
            <div className="rounded-[22px] border border-dashed border-[#eac8d2] bg-white p-6 text-sm text-[#8b6a74]">
              Tu carrito esta vacio. Agrega algo rico para comenzar.
            </div>
          ) : (
            <div className="space-y-3">
              {cartLines.map((item) => (
                <div
                  key={item.productoId}
                  className="grid gap-3 rounded-[24px] border border-[#f2d9df] bg-white p-4 md:grid-cols-[minmax(0,1fr)_auto_auto]"
                >
                  <div className="space-y-1">
                    <div className="font-semibold text-[#5f3041]">
                      {item.product?.nombre ?? "Producto"}
                    </div>
                    <div className="text-sm text-[#7f5b67]">
                      {item.product?.descripcion ?? "Producto sin descripcion"}
                    </div>
                    <div className="text-sm font-medium text-[#b85f79]">
                      {formatCurrency(item.product?.precioVenta ?? 0)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <QuantityButton
                      label="Reducir cantidad"
                      onClick={() => updateQuantity(item.productoId, item.cantidad - 1)}
                    >
                      -
                    </QuantityButton>
                    <div className="min-w-14 rounded-xl border border-[#f0d6da] bg-[#fff8fa] px-3 py-2 text-center font-semibold text-[#5f3041]">
                      {item.cantidad}
                    </div>
                    <QuantityButton
                      label="Aumentar cantidad"
                      onClick={() => updateQuantity(item.productoId, item.cantidad + 1)}
                    >
                      +
                    </QuantityButton>
                  </div>
                  <div className="flex items-center justify-between gap-3 md:flex-col md:items-end">
                    <div className="text-sm font-semibold text-[#5f3041]">
                      {formatCurrency(item.subtotal)}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(item.productoId)}
                      className="text-sm font-medium text-danger"
                    >
                      Quitar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4 rounded-[26px] border border-[#f2d9df] bg-[#fff8fa] p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-sm font-semibold uppercase tracking-wide text-[#b85f79] shadow-sm">
              3
            </div>
            <div>
              <h3 className="text-lg font-semibold text-[#5f3041]">Dejanos tus datos</h3>
              <p className="text-sm text-[#7f5b67]">
                Esto va al final, solo para confirmarte el pedido.
              </p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Nombre del cliente"
              value={form.nombre}
              onChange={(value) => setForm((current) => ({ ...current, nombre: value }))}
              error={validation.errors.nombre}
              placeholder="Ejemplo: Rodrigo"
              autoComplete="name"
            />
            <Field
              label="Numero de telefono"
              value={form.telefono}
              onChange={(value) =>
                setForm((current) => ({ ...current, telefono: value }))
              }
              error={validation.errors.telefono}
              placeholder="Ejemplo: 999999999"
              autoComplete="tel"
              inputMode="tel"
            />
          </div>
          <Field
            label="Lugar de trabajo"
            value={form.lugarTrabajo}
            onChange={(value) =>
              setForm((current) => ({ ...current, lugarTrabajo: value }))
            }
            error={validation.errors.lugarTrabajo}
            placeholder="Ejemplo: Finanzas o Recepcion"
            autoComplete="organization"
          />
          <input
            tabIndex={-1}
            autoComplete="off"
            value={form.contactoOculto ?? ""}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                contactoOculto: event.target.value
              }))
            }
            className="hidden"
            aria-hidden="true"
          />
        </div>

        <button
          type="submit"
          disabled={submitting || loadingProducts || products.length === 0}
          className="w-full rounded-[24px] bg-[#b85f79] px-4 py-4 text-base font-semibold text-white transition hover:bg-[#a8526c] disabled:cursor-not-allowed disabled:bg-[#ddb7c2]"
        >
          {submitting ? "Enviando pedido..." : "Confirmar pedido"}
        </button>
        {serverError ? <p className="text-sm text-danger">{serverError}</p> : null}
      </form>

      <aside className="space-y-4 xl:sticky xl:top-6 xl:h-fit">
        <div className="overflow-hidden rounded-[30px] border border-[#f0d6da] bg-white/95 shadow-soft">
          <div className="bg-[linear-gradient(180deg,#fff1f4_0%,#fff8fa_100%)] p-5">
            <h3 className="text-lg font-semibold text-[#5f3041]">Resumen de compra</h3>
            <p className="mt-1 text-sm text-[#7f5b67]">
              Revisa cantidades y total antes de enviarnos tu pedido.
            </p>
          </div>
          <div className="space-y-3 p-5">
            <div className="mt-4 space-y-3">
              {cartLines.length === 0 ? (
                <p className="text-sm text-[#7f5b67]">
                  Tu resumen aparecera apenas agregues productos.
                </p>
              ) : (
                cartLines.map((item) => (
                  <div
                    key={item.productoId}
                    className="flex items-start justify-between gap-4 rounded-[22px] border border-[#f2d9df] bg-[#fff8fa] px-4 py-3"
                  >
                    <div>
                      <div className="font-medium text-[#5f3041]">
                        {item.product?.nombre}
                      </div>
                      <div className="text-sm text-[#8b6a74]">x{item.cantidad}</div>
                    </div>
                    <div className="text-sm font-semibold text-[#b85f79]">
                      {formatCurrency(item.subtotal)}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-[#f0d6da] pt-4 text-base">
              <span className="font-semibold text-[#5f3041]">Total</span>
              <span className="font-semibold text-[#b85f79]">{formatCurrency(total)}</span>
            </div>
          </div>
        </div>

        <div className="rounded-[30px] border border-[#f0d6da] bg-white/95 p-5 shadow-soft">
          <h3 className="text-lg font-semibold text-[#5f3041]">Antes de enviar</h3>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-[#7f5b67]">
            <li>Escoge todo lo que quieras en un solo pedido.</li>
            <li>Ajusta cantidades al momento, sin recargar la pagina.</li>
            <li>Luego te confirmamos directo por telefono.</li>
          </ul>
        </div>

        {submitted ? (
          <div className="rounded-[30px] border border-success/30 bg-white/95 p-5 shadow-soft">
            <p className="font-semibold text-success">Pedido registrado correctamente.</p>
            <p className="mt-2 text-sm leading-6 text-[#7f5b67]">
              Gracias por confiar en Pauli Store. Te confirmaremos disponibilidad y
              coordinacion lo antes posible.
            </p>
            <div className="mt-4 rounded-[22px] border border-[#f2d9df] bg-[#fff8fa] p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[#8b6a74]">Pedido</span>
                <span className="font-medium text-[#5f3041]">{submitted.pedidoId}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-[#8b6a74]">Total</span>
                <span className="font-semibold text-[#b85f79]">
                  {formatCurrency(submitted.total)}
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </aside>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#f0d6da] bg-white/94 px-4 py-3 shadow-[0_-12px_30px_rgba(91,49,65,0.08)] backdrop-blur xl:hidden">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-[#8b6a74]">
              Total del carrito
            </div>
            <div className="truncate text-lg font-semibold text-[#5f3041]">
              {formatCurrency(total)}
            </div>
          </div>
          <button
            type="submit"
            form="customer-order-form"
            disabled={submitting || loadingProducts || products.length === 0}
            className="shrink-0 rounded-2xl bg-[#b85f79] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#a8526c] disabled:cursor-not-allowed disabled:bg-[#ddb7c2]"
          >
            {submitting ? "Enviando..." : "Enviar pedido"}
          </button>
        </div>
      </div>
    </section>
  );
}

type FieldProps = {
  label: string;
  value: string;
  error?: string;
  placeholder?: string;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  onChange: (value: string) => void;
};

function Field({
  label,
  value,
  error,
  placeholder,
  autoComplete,
  inputMode,
  onChange
}: FieldProps) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-[#5f3041]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        className="w-full rounded-[18px] border border-[#f0d6da] bg-white px-4 py-3 text-base text-[#5f3041] outline-none transition placeholder:text-[#b797a2] focus:border-[#d37b94]"
      />
      {error ? <span className="text-sm text-danger">{error}</span> : null}
    </label>
  );
}

type QuantityButtonProps = {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
};

function QuantityButton({ children, label, onClick }: QuantityButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#f0d6da] bg-white text-xl font-semibold text-[#5f3041] transition hover:border-[#d37b94] hover:text-[#b85f79]"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
