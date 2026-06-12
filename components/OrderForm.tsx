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
    <section className="grid gap-6 pb-24 xl:grid-cols-[1.2fr_0.8fr] xl:pb-0">
      <form
        id="customer-order-form"
        className="space-y-6 rounded-[28px] border border-border/60 bg-white/92 p-5 shadow-soft backdrop-blur sm:p-6"
        onSubmit={handleSubmit}
      >
        <div className="overflow-hidden rounded-[24px] border border-border/60 bg-[linear-gradient(180deg,#ff8e90_0%,#f5b2a7_100%)] p-5 text-white sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <span className="inline-flex rounded-full bg-white/22 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
                Pedido del dia
              </span>
              <h2 className="text-3xl font-bold">Tu pedido, a tu gusto</h2>
              <p className="max-w-xl text-sm leading-6 text-white/88">
                Elige lo que quieras llevar, suma cantidades y deja el pedido listo
                para coordinar contigo.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-center text-sm">
              <div className="rounded-2xl bg-white/18 px-4 py-3 backdrop-blur">
                <div className="text-white/74">Unidades</div>
                <div className="mt-1 text-lg font-semibold">{productCount}</div>
              </div>
              <div className="rounded-2xl bg-white/18 px-4 py-3 backdrop-blur">
                <div className="text-white/74">Lineas</div>
                <div className="mt-1 text-lg font-semibold">{cartLines.length}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4 rounded-[24px] border border-border/60 bg-[#fffaf6] p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-sm font-semibold uppercase tracking-wide text-primary shadow-sm">
              Tu
            </div>
            <div>
              <h3 className="text-lg font-semibold text-ink">Tus datos</h3>
              <p className="text-sm text-ink/70">
                Solo lo justo para confirmar y entregarte bien.
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

        <div className="space-y-4 rounded-[24px] border border-border/60 bg-[#fffaf6] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-sm font-semibold uppercase tracking-wide text-primary shadow-sm">
                Hoy
              </div>
              <div>
                <h3 className="text-lg font-semibold text-ink">Lo que preparamos hoy</h3>
                <p className="text-sm text-ink/70">
                  Productos caseros listos para compartir, regalar o disfrutar.
                </p>
              </div>
            </div>
            {loadingProducts ? (
              <span className="text-sm text-ink/60">Cargando...</span>
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
                  className="rounded-[22px] border border-border/70 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <h4 className="text-base font-semibold text-ink">{product.nombre}</h4>
                      <p className="text-sm leading-6 text-ink/70">
                        {product.descripcion}
                      </p>
                      <div className="inline-flex rounded-full bg-[#fff4eb] px-2.5 py-1 text-xs font-medium text-primary">
                        {product.tipoProducto ?? "simple"}
                      </div>
                    </div>
                    {currentItem ? (
                      <span className="rounded-full bg-secondary/50 px-3 py-1 text-xs font-semibold text-ink">
                        x{currentItem.cantidad}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-primary">
                      {formatCurrency(product.precioVenta)}
                    </div>
                    <button
                      type="button"
                      onClick={() => addProduct(product.id)}
                      className="rounded-xl bg-ink px-3 py-2 text-sm font-medium text-white transition hover:opacity-90"
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

        <div className="space-y-4 rounded-[24px] border border-border/60 bg-[#fffaf6] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-sm font-semibold uppercase tracking-wide text-primary shadow-sm">
                Mix
              </div>
              <div>
                <h3 className="text-lg font-semibold text-ink">Tu carrito</h3>
                <p className="text-sm text-ink/70">
                  Agrega tus favoritos y luego ajusta el pedido a tu gusto.
                </p>
              </div>
            </div>
            <div className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-ink shadow-sm">
              {formatCurrency(total)}
            </div>
          </div>

          {cartLines.length === 0 ? (
            <div className="rounded-[22px] border border-dashed border-border bg-white p-6 text-sm text-ink/65">
              Aun no agregas productos al pedido.
            </div>
          ) : (
            <div className="space-y-3">
              {cartLines.map((item) => (
                <div
                  key={item.productoId}
                  className="grid gap-3 rounded-[22px] border border-border/70 bg-white p-4 md:grid-cols-[minmax(0,1fr)_auto_auto]"
                >
                  <div className="space-y-1">
                    <div className="font-semibold text-ink">
                      {item.product?.nombre ?? "Producto"}
                    </div>
                    <div className="text-sm text-ink/70">
                      {item.product?.descripcion ?? "Producto sin descripcion"}
                    </div>
                    <div className="text-sm font-medium text-primary">
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
                    <div className="min-w-14 rounded-lg border border-border bg-background px-3 py-2 text-center font-semibold text-ink">
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
                    <div className="text-sm font-semibold text-ink">
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

        <button
          type="submit"
          disabled={submitting || loadingProducts || products.length === 0}
          className="w-full rounded-[22px] bg-ink px-4 py-4 text-base font-semibold text-white transition hover:opacity-90"
        >
          {submitting ? "Enviando pedido..." : "Enviar pedido"}
        </button>
        {serverError ? <p className="text-sm text-danger">{serverError}</p> : null}
      </form>

      <aside className="space-y-4 xl:sticky xl:top-6 xl:h-fit">
        <div className="overflow-hidden rounded-[28px] border border-border/60 bg-white/92 shadow-soft">
          <div className="bg-[linear-gradient(180deg,#fff1ec_0%,#fff7f2_100%)] p-5">
            <h3 className="text-lg font-semibold text-ink">Resumen del pedido</h3>
            <p className="mt-1 text-sm text-ink/70">
              Revisa cantidades y total antes de enviarnos tu pedido.
            </p>
          </div>
          <div className="space-y-3 p-5">
            <div className="mt-4 space-y-3">
              {cartLines.length === 0 ? (
                <p className="text-sm text-ink/70">
                  Agrega productos para ver el resumen.
                </p>
              ) : (
                cartLines.map((item) => (
                  <div
                    key={item.productoId}
                    className="flex items-start justify-between gap-4 rounded-[20px] border border-border/70 bg-background/80 px-4 py-3"
                  >
                    <div>
                      <div className="font-medium text-ink">{item.product?.nombre}</div>
                      <div className="text-sm text-ink/65">x{item.cantidad}</div>
                    </div>
                    <div className="text-sm font-semibold text-primary">
                      {formatCurrency(item.subtotal)}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-border pt-4 text-base">
              <span className="font-semibold text-ink">Total</span>
              <span className="font-semibold text-primary">{formatCurrency(total)}</span>
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-border/60 bg-white/92 p-5 shadow-soft">
          <h3 className="text-lg font-semibold text-ink">Nuestro toque</h3>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-ink/75">
            <li>Productos caseros preparados con dedicacion y detalle.</li>
            <li>Puedes pedir varias cosas en un solo envio.</li>
            <li>Te confirmamos con calma para coordinar de la mejor manera.</li>
          </ul>
        </div>

        {submitted ? (
          <div className="rounded-[28px] border border-success/30 bg-white/95 p-5 shadow-soft">
            <p className="font-semibold text-success">Pedido registrado correctamente.</p>
            <p className="mt-2 text-sm leading-6 text-ink/75">
              Gracias por confiar en Pauli Store. Te confirmaremos disponibilidad y
              coordinacion lo antes posible.
            </p>
            <div className="mt-4 rounded-[20px] border border-border/70 bg-background/80 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink/65">Pedido</span>
                <span className="font-medium text-ink">{submitted.pedidoId}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-ink/65">Total</span>
                <span className="font-semibold text-primary">
                  {formatCurrency(submitted.total)}
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </aside>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-white/94 px-4 py-3 shadow-[0_-12px_30px_rgba(58,42,26,0.08)] backdrop-blur xl:hidden">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-ink/55">
              Total del carrito
            </div>
            <div className="truncate text-lg font-semibold text-ink">
              {formatCurrency(total)}
            </div>
          </div>
          <button
            type="submit"
            form="customer-order-form"
            disabled={submitting || loadingProducts || products.length === 0}
            className="shrink-0 rounded-2xl bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90"
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
      <span className="text-sm font-medium text-ink">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        className="w-full rounded-[18px] border border-border/80 bg-white px-4 py-3 text-base text-ink outline-none transition placeholder:text-ink/35 focus:border-primary"
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
      className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-white text-xl font-semibold text-ink transition hover:border-primary hover:text-primary"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
