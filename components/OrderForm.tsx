"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Building2,
  Clock3,
  Phone,
  ShieldCheck,
  ShoppingBag,
  UserRound
} from "lucide-react";
import { AppFooter } from "@/components/AppFooter";
import { CartSummary } from "@/components/shared/CartSummary";
import { ProductCatalog } from "@/components/shared/ProductCatalog";
import { formatChileanMobileInput, parseChileanMobilePhone } from "@/lib/chile-phone";
import { formatCurrency } from "@/lib/format";
import { calcularTotalPedido, normalizarProductoParaCarrito } from "@/lib/order-helpers";
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

const RECENT_CUSTOMERS_STORAGE_KEY = "pauli-store-recent-customers";

type SavedCustomerProfile = {
  nombre: string;
  telefono: string;
  lugarTrabajo: string;
  lastUsedAt: string;
};

type StockLimitState = {
  productId: string;
  productName: string;
  available: number;
  apply: () => void;
};

function readRecentCustomers(): SavedCustomerProfile[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(RECENT_CUSTOMERS_STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as SavedCustomerProfile[];

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (item) =>
        typeof item?.nombre === "string" &&
        typeof item?.telefono === "string" &&
        typeof item?.lugarTrabajo === "string"
    );
  } catch {
    return [];
  }
}

function persistRecentCustomers(nextCustomers: SavedCustomerProfile[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    RECENT_CUSTOMERS_STORAGE_KEY,
    JSON.stringify(nextCustomers.slice(0, 5))
  );
}

function mergeRecentCustomer(
  currentCustomers: SavedCustomerProfile[],
  form: CustomerFormData
) {
  const phone = parseChileanMobilePhone(form.telefono);

  if (!phone) {
    return currentCustomers;
  }

  const nextRecord: SavedCustomerProfile = {
    nombre: form.nombre.trim(),
    telefono: phone.e164,
    lugarTrabajo: form.lugarTrabajo.trim(),
    lastUsedAt: new Date().toISOString()
  };

  return [
    nextRecord,
    ...currentCustomers.filter((item) => item.telefono !== nextRecord.telefono)
  ].slice(0, 5);
}

export function OrderForm() {
  const [form, setForm] = useState<CustomerFormData>(initialForm);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [recentCustomers, setRecentCustomers] = useState<SavedCustomerProfile[]>([]);
  const [submitted, setSubmitted] = useState<CustomerOrderResponse | null>(null);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState("");
  const [autoFillMessage, setAutoFillMessage] = useState("");
  const [lastAutoFilledPhone, setLastAutoFilledPhone] = useState("");
  const [stockLimitState, setStockLimitState] = useState<StockLimitState | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadProducts() {
      try {
        setLoadingProducts(true);
        const response = await fetch("/api/products", {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache'
          }
        });
        const data = (await response.json()) as {
          products?: ProductRecord[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(data.error ?? "No fue posible cargar productos.");
        }

        if (!cancelled) {
          console.log("Productos cargados con stockAgenda:", data.products?.map(p => ({
            id: p.id,
            nombre: p.nombre,
            stockActual: p.stockActual,
            stockAgenda: p.stockAgenda
          })));
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

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setRecentCustomers(readRecentCustomers());
    });

    return () => window.cancelAnimationFrame(frameId);
  }, []);

  const validation = validateCustomerOrderForm(form, products);

  const cartLines = useMemo(
    () => normalizarProductoParaCarrito(form.items, products),
    [form.items, products]
  );

  const total = calcularTotalPedido(cartLines);
  const quantitiesByProduct = useMemo(
    () =>
      Object.fromEntries(form.items.map((item) => [item.productoId, item.cantidad])),
    [form.items]
  );

  function requestStockAdjustment(
    product: ProductRecord,
    nextQuantity: number,
    onAccept: () => void
  ) {
    const available = Math.max(product.stockActual ?? 0, 0);

    if (nextQuantity <= available) {
      onAccept();
      return;
    }

    setStockLimitState({
      productId: product.id,
      productName: product.nombre,
      available,
      apply: onAccept
    });
  }

  function addProduct(productId: string) {
    const product = products.find((item) => item.id === productId);

    if (!product) {
      return;
    }
    const existing = form.items.find((item) => item.productoId === productId);
    const nextQuantity = (existing?.cantidad ?? 0) + 1;

    if ((product.stockActual ?? 0) <= 0) {
      setServerError(`${product.nombre} no tiene stock disponible por ahora.`);
      return;
    }

    if (nextQuantity > (product.stockActual ?? 0)) {
      requestStockAdjustment(product, nextQuantity, () => {
        setForm((latest) => {
          const latestExisting = latest.items.find((item) => item.productoId === productId);

          if (latestExisting) {
            return {
              ...latest,
              items: latest.items.map((item) =>
                item.productoId === productId
                  ? { ...item, cantidad: Math.max(product.stockActual ?? 0, 0) }
                  : item
              )
            };
          }

          return {
            ...latest,
            items: [
              ...latest.items,
              {
                productoId: productId,
                cantidad: Math.max(product.stockActual ?? 0, 0)
              }
            ]
          };
        });
      });
      return;
    }

    setServerError("");
    setForm((current) => {
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
    const product = products.find((item) => item.id === productId);

    if (!product) {
      return;
    }

    if (nextQuantity <= 0) {
      removeItem(productId);
      return;
    }

    if (nextQuantity > (product.stockActual ?? 0)) {
      requestStockAdjustment(product, nextQuantity, () => {
        setForm((current) => ({
          ...current,
          items: current.items.map((item) =>
            item.productoId === productId
              ? {
                  ...item,
                  cantidad: Math.max(product.stockActual ?? 0, 0)
                }
              : item
          )
        }));
      });
      return;
    }

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

  function applyRecentCustomer(customer: SavedCustomerProfile) {
    const parsedPhone = parseChileanMobilePhone(customer.telefono);

    setForm((current) => ({
      ...current,
      nombre: customer.nombre,
      telefono: parsedPhone ? formatChileanMobileInput(parsedPhone.national) : current.telefono,
      lugarTrabajo: customer.lugarTrabajo
    }));
    setAutoFillMessage(`Cargamos los datos de ${customer.nombre}.`);
    setLastAutoFilledPhone(customer.telefono);
  }

  function handlePhoneChange(rawValue: string) {
    const formattedPhone = formatChileanMobileInput(rawValue);
    const parsedPhone = parseChileanMobilePhone(formattedPhone);

    setForm((current) => ({
      ...current,
      telefono: formattedPhone
    }));

    if (!formattedPhone.trim()) {
      setLastAutoFilledPhone("");
      setAutoFillMessage("");
      return;
    }

    if (!parsedPhone) {
      setAutoFillMessage("");
      return;
    }

    const matchedCustomer = recentCustomers.find(
      (customer) => customer.telefono === parsedPhone.e164
    );

    if (!matchedCustomer || matchedCustomer.telefono === lastAutoFilledPhone) {
      return;
    }

    setForm((current) => ({
      ...current,
      telefono: formattedPhone,
      nombre: current.nombre.trim() || matchedCustomer.nombre,
      lugarTrabajo: current.lugarTrabajo.trim() || matchedCustomer.lugarTrabajo
    }));
    setLastAutoFilledPhone(matchedCustomer.telefono);
    setAutoFillMessage(`Reconocimos a ${matchedCustomer.nombre}. Completamos tus datos.`);
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

      const nextCustomers = mergeRecentCustomer(recentCustomers, form);
      setRecentCustomers(nextCustomers);
      persistRecentCustomers(nextCustomers);
      setSubmitted(data);
      setAutoFillMessage("Guardamos tus datos en este dispositivo para tu próximo pedido.");
      setLastAutoFilledPhone("");
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
    <>
      <section
        id="hacer-pedido"
        className="grid w-full max-w-full min-w-0 gap-6 scroll-mt-6 overflow-x-hidden pb-[calc(140px+env(safe-area-inset-bottom))] xl:grid-cols-[1.2fr_0.8fr] xl:pb-6"
      >
        <form
          id="customer-order-form"
          method="post"
          className="max-w-full space-y-6 overflow-x-hidden rounded-[30px] border border-[#d8ebdd] bg-white/95 p-5 shadow-soft backdrop-blur sm:p-6"
          onSubmit={handleSubmit}
        >
          {recentCustomers.length > 0 ? (
            <div className="rounded-[26px] border border-[#d8ebdd] bg-[#f6fcf7] p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#3fa66b] shadow-sm">
                  <Clock3 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-[#1f3328]">
                    Clientes frecuentes
                  </h3>
                  <p className="copy-justified text-sm text-[#6b7c70]">
                    Si ya pediste desde este equipo, toca tu nombre y seguimos.
                  </p>
                </div>
              </div>
              <div className="mt-4 flex max-w-full flex-wrap gap-3 overflow-x-hidden">
                {recentCustomers.map((customer) => (
                  <button
                    key={customer.telefono}
                    type="button"
                    onClick={() => applyRecentCustomer(customer)}
                    className="max-w-full rounded-full border border-[#d8ebdd] bg-white px-4 py-3 text-left transition hover:border-[#3fa66b] hover:shadow-sm"
                  >
                    <div className="text-sm font-semibold text-[#1f3328]">
                      {customer.nombre}
                    </div>
                    <div className="text-xs text-[#6b7c70]">{customer.lugarTrabajo}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="space-y-4 rounded-[26px] border border-[#d8ebdd] bg-[linear-gradient(180deg,#eef8f0_0%,#f8fcf8_100%)] p-4 sm:p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#3fa66b] shadow-sm">
                  <ShoppingBag className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-[#1f3328]">
                    Catálogo del día
                  </h3>
                  <p className="copy-justified text-sm text-[#6b7c70]">
                    Elige tus favoritos del catálogo y suma lo que necesites.
                  </p>
                </div>
              </div>
              {loadingProducts ? (
                <span className="text-sm text-[#6b7c70]">Cargando...</span>
              ) : null}
            </div>
            <ProductCatalog
              products={products}
              quantities={quantitiesByProduct}
              onAdd={addProduct}
            />
            {validation.errors.items ? (
              <p className="text-sm text-danger">{validation.errors.items}</p>
            ) : null}
          </div>

          <div className="space-y-4 rounded-[26px] border border-[#d8ebdd] bg-[#f6fcf7] p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#3fa66b] shadow-sm">
                <UserRound className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[#1f3328]">Tus datos</h3>
                <p className="copy-justified text-sm text-[#6b7c70]">
                  Completa esto y Pauli te confirma disponibilidad por WhatsApp.
                </p>
              </div>
            </div>

            {autoFillMessage ? (
              <div
                aria-live="polite"
                className="flex items-start gap-2 rounded-2xl border border-[#d8ebdd] bg-white px-4 py-3 text-sm text-[#6b7c70]"
              >
                <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#3fa66b]" />
                <span>{autoFillMessage}</span>
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <TextField
                label="Nombre del cliente"
                value={form.nombre}
                onChange={(value) => setForm((current) => ({ ...current, nombre: value }))}
                error={validation.errors.nombre}
                placeholder="Ejemplo: Rodrigo Riedmann"
                autoComplete="name"
                icon={<UserRound className="h-4 w-4" />}
              />
              <PhoneField
                label="Celular de contacto"
                value={form.telefono}
                onChange={handlePhoneChange}
                error={validation.errors.telefono}
              />
            </div>
            <TextField
              label="Lugar de trabajo"
              value={form.lugarTrabajo}
              onChange={(value) =>
                setForm((current) => ({ ...current, lugarTrabajo: value }))
              }
              error={validation.errors.lugarTrabajo}
              placeholder="Ejemplo: Finanzas, recepción o piso 3"
              autoComplete="organization"
              icon={<Building2 className="h-4 w-4" />}
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
            className="inline-flex w-full items-center justify-center gap-2 rounded-[24px] bg-[#3fa66b] px-4 py-4 text-base font-semibold text-white transition hover:bg-[#247a4d] disabled:cursor-not-allowed disabled:bg-[#a8d8b7]"
          >
            <ShoppingBag className="h-5 w-5" />
            {submitting ? "Registrando pedido..." : "Registrar mi pedido"}
          </button>
          {serverError ? <p className="text-sm text-danger">{serverError}</p> : null}
        </form>

        <aside className="max-w-full space-y-4 xl:sticky xl:top-6 xl:h-fit">
          <CartSummary
            lines={cartLines}
            total={total}
            onDecrease={updateQuantity}
            onIncrease={updateQuantity}
            onRemove={removeItem}
            emptyText="Tu resumen aparecerá apenas elijas algo del catálogo."
          />

          <div className="rounded-[30px] border border-[#d8ebdd] bg-white/95 p-5 shadow-soft">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f6fcf7] text-[#3fa66b]">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[#1f3328]">Pedido simple</h3>
                <p className="copy-justified text-sm text-[#6b7c70]">
                  Tu pedido queda pendiente de confirmación. Pauli revisa stock y luego te escribe.
                </p>
              </div>
            </div>
          </div>
        </aside>
      </section>

      {cartLines.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-30 w-full max-w-full overflow-x-hidden border-t border-[#d8ebdd] bg-white/94 px-4 py-3 pb-[calc(12px+env(safe-area-inset-bottom))] shadow-[0_-12px_30px_rgba(31,51,40,0.08)] backdrop-blur xl:hidden">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wide text-[#6b7c70]">
                Total del carrito
              </div>
              <div className="truncate text-lg font-semibold text-[#1f3328]">
                {formatCurrency(total)}
              </div>
            </div>
            <button
              type="submit"
              form="customer-order-form"
              disabled={submitting || loadingProducts || products.length === 0}
              className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-2xl bg-[#3fa66b] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#247a4d] disabled:cursor-not-allowed disabled:bg-[#a8d8b7]"
            >
              <ShoppingBag className="h-4 w-4" />
              {submitting ? "Registrando..." : "Registrar pedido"}
            </button>
          </div>
        </div>
      ) : null}

      <AppFooter className="pb-[calc(140px+env(safe-area-inset-bottom))] xl:pb-6" />

      {submitted ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#1f3328]/30 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[32px] border border-[#d8ebdd] bg-white p-6 shadow-[0_24px_60px_rgba(31,51,40,0.18)]">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#eef8f0] text-success">
                <BadgeCheck className="h-6 w-6" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-semibold text-[#1f3328]">
                  Pedido registrado correctamente
                </h3>
                <p className="copy-justified text-sm leading-6 text-[#6b7c70]">
                  Tu pedido quedó pendiente de confirmación. Pauli revisará disponibilidad y te avisará por WhatsApp.
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-[22px] border border-[#d8ebdd] bg-[#f6fcf7] p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[#6b7c70]">Código</span>
                <span className="font-medium text-[#1f3328]">{submitted.pedidoId}</span>
              </div>
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="text-[#6b7c70]">Total</span>
                <span className="font-semibold text-[#3fa66b]">
                  {formatCurrency(submitted.total)}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSubmitted(null)}
              className="mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-[#3fa66b] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#247a4d]"
            >
              Entendido
            </button>
          </div>
        </div>
      ) : null}

      {stockLimitState ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1f3328]/30 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-[28px] border border-[#d8ebdd] bg-white p-6 shadow-[0_24px_60px_rgba(31,51,40,0.18)]">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eef8f0] text-[#247a4d]">
                <ShoppingBag className="h-5 w-5" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-[#1f3328]">
                  Stock disponible
                </h3>
                <p className="copy-justified text-sm leading-6 text-[#6b7c70]">
                  {stockLimitState.productName} solo cuenta con{" "}
                  {stockLimitState.available} disponible(s). Si quieres, dejamos esa
                  cantidad en tu pedido.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setStockLimitState(null)}
                className="rounded-2xl border border-[#d8ebdd] bg-white px-4 py-3 text-sm font-semibold text-[#1f3328]"
              >
                Mantener como está
              </button>
              <button
                type="button"
                onClick={() => {
                  stockLimitState.apply();
                  setStockLimitState(null);
                  setServerError("");
                }}
                className="rounded-2xl bg-[#3fa66b] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#247a4d]"
              >
                Agendar lo disponible
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

type TextFieldProps = {
  label: string;
  value: string;
  error?: string;
  placeholder?: string;
  autoComplete?: string;
  icon?: React.ReactNode;
  onChange: (value: string) => void;
};

function TextField({
  label,
  value,
  error,
  placeholder,
  autoComplete,
  icon,
  onChange
}: TextFieldProps) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-[#1f3328]">{label}</span>
      <div className="flex items-center gap-3 rounded-[18px] border border-[#d8ebdd] bg-white px-4 py-3 transition focus-within:border-[#3fa66b]">
        {icon ? <span className="text-[#6b7c70]">{icon}</span> : null}
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="w-full border-0 bg-transparent p-0 text-base text-[#1f3328] outline-none placeholder:text-[#6b7c70]"
        />
      </div>
      {error ? <span className="text-sm text-danger">{error}</span> : null}
    </label>
  );
}

type PhoneFieldProps = {
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
};

function PhoneField({ label, value, error, onChange }: PhoneFieldProps) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-[#1f3328]">{label}</span>
      <div className="flex items-center gap-3 rounded-[18px] border border-[#d8ebdd] bg-white px-4 py-3 transition focus-within:border-[#3fa66b]">
        <Phone className="h-4 w-4 text-[#6b7c70]" />
        <span className="text-sm font-semibold text-[#247a4d]">+56</span>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="9 1234 5678"
          autoComplete="tel"
          inputMode="tel"
          className="w-full border-0 bg-transparent p-0 text-base text-[#1f3328] outline-none placeholder:text-[#6b7c70]"
        />
      </div>
      {error ? <span className="text-sm text-danger">{error}</span> : null}
    </label>
  );
}
