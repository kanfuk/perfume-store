"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCurrency } from "@/lib/format";
import type { ProductRecord } from "@/lib/types";
import {
  type CustomerFormData,
  validateCustomerOrderForm
} from "@/lib/validators";

const initialForm: CustomerFormData = {
  nombre: "",
  telefono: "",
  lugarTrabajo: "",
  productoId: "",
  cantidad: 1
};

export function OrderForm() {
  const [form, setForm] = useState<CustomerFormData>(initialForm);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [submitted, setSubmitted] = useState<null | { total: number }>(null);
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

    loadProducts();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === form.productoId) ?? null,
    [form.productoId, products]
  );

  const validation = validateCustomerOrderForm(form, products);
  const total = selectedProduct ? selectedProduct.precioVenta * form.cantidad : 0;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setServerError("");

    if (!validation.isValid || !selectedProduct) {
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

      const data = (await response.json()) as { total?: number; error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "No fue posible registrar el pedido.");
      }

      setSubmitted({
        total: data.total ?? 0
      });
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
    <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <form
        className="space-y-6 rounded-lg border border-border bg-panel p-5 shadow-soft sm:p-6"
        onSubmit={handleSubmit}
      >
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold text-ink">Registrar pedido</h2>
          <p className="text-sm leading-6 text-ink/75">
            Completa tus datos, elige un producto y revisa tu total antes de
            enviar.
          </p>
        </div>

        <div className="space-y-4 rounded-lg border border-border bg-background p-4">
          <h3 className="text-lg font-semibold text-ink">Tus datos</h3>
          <Field
            label="Nombre del cliente"
            value={form.nombre}
            onChange={(value) => setForm((current) => ({ ...current, nombre: value }))}
            error={validation.errors.nombre}
          />
          <Field
            label="Numero de telefono"
            value={form.telefono}
            onChange={(value) =>
              setForm((current) => ({ ...current, telefono: value }))
            }
            error={validation.errors.telefono}
          />
          <Field
            label="Lugar de trabajo"
            value={form.lugarTrabajo}
            onChange={(value) =>
              setForm((current) => ({ ...current, lugarTrabajo: value }))
            }
            error={validation.errors.lugarTrabajo}
          />
        </div>

        <div className="space-y-4 rounded-lg border border-border bg-background p-4">
          <h3 className="text-lg font-semibold text-ink">Elige tu producto</h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {products.map((product) => {
              const isSelected = form.productoId === product.id;

              return (
                <button
                  key={product.id}
                  type="button"
                  className={`rounded-lg border p-4 text-left transition ${
                    isSelected
                      ? "border-primary bg-primary/10"
                      : "border-border bg-panel hover:border-primary/60"
                  }`}
                  onClick={() =>
                    setForm((current) => ({ ...current, productoId: product.id }))
                  }
                >
                  <div className="space-y-1">
                    <div className="text-base font-semibold text-ink">
                      {product.nombre}
                    </div>
                    <p className="text-sm leading-6 text-ink/70">
                      {product.descripcion}
                    </p>
                  </div>
                  <div className="mt-4 text-sm font-semibold text-primary">
                    {formatCurrency(product.precioVenta)}
                  </div>
                </button>
              );
            })}
          </div>
          {loadingProducts ? (
            <p className="text-sm text-ink/70">Cargando productos activos...</p>
          ) : null}
          {validation.errors.productoId ? (
            <p className="text-sm text-danger">{validation.errors.productoId}</p>
          ) : null}
        </div>

        <div className="space-y-4 rounded-lg border border-border bg-background p-4">
          <h3 className="text-lg font-semibold text-ink">Cantidad</h3>
          <div className="flex items-center gap-3">
            <QuantityButton
              label="Reducir cantidad"
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  cantidad: Math.max(1, current.cantidad - 1)
                }))
              }
            >
              -
            </QuantityButton>
            <div className="min-w-16 rounded-lg border border-border bg-panel px-4 py-3 text-center text-lg font-semibold text-ink">
              {form.cantidad}
            </div>
            <QuantityButton
              label="Aumentar cantidad"
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  cantidad: current.cantidad + 1
                }))
              }
            >
              +
            </QuantityButton>
          </div>
          {validation.errors.cantidad ? (
            <p className="text-sm text-danger">{validation.errors.cantidad}</p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={submitting || loadingProducts || products.length === 0}
          className="w-full rounded-lg bg-primary px-4 py-3 text-base font-semibold text-white transition hover:bg-[#8e5725]"
        >
          {submitting ? "Registrando..." : "Registrar mi pedido"}
        </button>
        {serverError ? <p className="text-sm text-danger">{serverError}</p> : null}
      </form>

      <aside className="space-y-4">
        <div className="rounded-lg border border-border bg-panel p-5 shadow-soft">
          <h3 className="text-lg font-semibold text-ink">Resumen</h3>
          <dl className="mt-4 space-y-3 text-sm text-ink/80">
            <div className="flex items-center justify-between gap-4">
              <dt>Producto</dt>
              <dd className="font-medium text-ink">
                {selectedProduct?.nombre ?? "Sin seleccionar"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt>Costo unitario</dt>
              <dd className="font-medium text-ink">
                {selectedProduct
                  ? formatCurrency(selectedProduct.precioVenta)
                  : "$0"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt>Cantidad</dt>
              <dd className="font-medium text-ink">{form.cantidad}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-border pt-3 text-base">
              <dt className="font-semibold text-ink">Total</dt>
              <dd className="font-semibold text-primary">
                {formatCurrency(total)}
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border border-border bg-panel p-5 shadow-soft">
          <h3 className="text-lg font-semibold text-ink">Reglas activas</h3>
          <ul className="mt-4 space-y-2 text-sm leading-6 text-ink/75">
            <li>Todo pedido nuevo nace como PENDIENTE.</li>
            <li>Todo pago nuevo nace como SIN_PAGO.</li>
            <li>El total se recalcula a partir del producto activo.</li>
          </ul>
        </div>

        {submitted ? (
          <div className="rounded-lg border border-success/30 bg-success/10 p-5 text-sm leading-6 text-ink">
            <p className="font-semibold text-success">
              Pedido registrado correctamente.
            </p>
            <p>
              Tu pedido quedo pendiente de confirmacion. Pauli revisara
              disponibilidad y, si corresponde, lo dejara agendado.
            </p>
            <p className="mt-2 font-medium text-ink">
              Total registrado: {formatCurrency(submitted.total)}
            </p>
          </div>
        ) : null}
      </aside>
    </section>
  );
}

type FieldProps = {
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
};

function Field({ label, value, error, onChange }: FieldProps) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-ink">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-border bg-panel px-4 py-3 text-base text-ink outline-none transition focus:border-primary"
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
      className="inline-flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-panel text-xl font-semibold text-ink transition hover:border-primary hover:text-primary"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
