"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Building2,
  Clock3,
  Minus,
  PackageOpen,
  Phone,
  Plus,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Trash2,
  UserRound
} from "lucide-react";
import { formatChileanMobileInput, parseChileanMobilePhone } from "@/lib/chile-phone";
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

const RECENT_CUSTOMERS_STORAGE_KEY = "pauli-store-recent-customers";

type SavedCustomerProfile = {
  nombre: string;
  telefono: string;
  lugarTrabajo: string;
  lastUsedAt: string;
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
  const [recentCustomers, setRecentCustomers] = useState<SavedCustomerProfile[]>(
    () => readRecentCustomers()
  );
  const [submitted, setSubmitted] = useState<CustomerOrderResponse | null>(null);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState("");
  const [autoFillMessage, setAutoFillMessage] = useState("");
  const [lastAutoFilledPhone, setLastAutoFilledPhone] = useState("");

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
      setAutoFillMessage("Guardamos tus datos en este dispositivo para tu proximo pedido.");
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
            <div className="space-y-3">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/65 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#8f4156]">
                <Sparkles className="h-3.5 w-3.5" />
                Haz tu pedido
              </span>
              <h2 className="text-3xl font-bold">Primero eliges, despues confirmas</h2>
              <p className="max-w-xl text-sm leading-6 text-[#7e4a5c]">
                Escoge tus productos, revisa el carrito y al final dejas tus datos.
                Todo pensado para pedir rapido y sin enredos.
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
                <div className="text-[#8f6070]">Productos</div>
                <div className="mt-1 text-lg font-semibold text-[#6f3146]">
                  {cartLines.length}
                </div>
              </div>
            </div>
          </div>
        </div>

        {recentCustomers.length > 0 ? (
          <div className="rounded-[26px] border border-[#f2d9df] bg-[#fff8fa] p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#b85f79] shadow-sm">
                <Clock3 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[#5f3041]">
                  Clientes frecuentes
                </h3>
                <p className="text-sm text-[#7f5b67]">
                  Si ya pediste desde este equipo, puedes rellenar todo con un toque.
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              {recentCustomers.map((customer) => (
                <button
                  key={customer.telefono}
                  type="button"
                  onClick={() => applyRecentCustomer(customer)}
                  className="rounded-2xl border border-[#f0d6da] bg-white px-4 py-3 text-left transition hover:border-[#d37b94] hover:shadow-sm"
                >
                  <div className="text-sm font-semibold text-[#5f3041]">
                    {customer.nombre}
                  </div>
                  <div className="text-xs text-[#8b6a74]">{customer.lugarTrabajo}</div>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="space-y-4 rounded-[26px] border border-[#f2d9df] bg-[#fff8fa] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#b85f79] shadow-sm">
                <ShoppingBag className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[#5f3041]">
                  Elige tus productos
                </h3>
                <p className="text-sm text-[#7f5b67]">
                  Empieza aqui. Todo lo que agregues aparecera altiro en tu carrito.
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
                      className="inline-flex items-center gap-2 rounded-2xl bg-[#b85f79] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#a8526c]"
                    >
                      <Plus className="h-4 w-4" />
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
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#b85f79] shadow-sm">
                <ShoppingCart className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[#5f3041]">Revisa tu carrito</h3>
                <p className="text-sm text-[#7f5b67]">
                  Puedes subir, bajar o quitar productos antes de confirmar.
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
                      <Minus className="h-4 w-4" />
                    </QuantityButton>
                    <div className="min-w-14 rounded-xl border border-[#f0d6da] bg-[#fff8fa] px-3 py-2 text-center font-semibold text-[#5f3041]">
                      {item.cantidad}
                    </div>
                    <QuantityButton
                      label="Aumentar cantidad"
                      onClick={() => updateQuantity(item.productoId, item.cantidad + 1)}
                    >
                      <Plus className="h-4 w-4" />
                    </QuantityButton>
                  </div>
                  <div className="flex items-center justify-between gap-3 md:flex-col md:items-end">
                    <div className="text-sm font-semibold text-[#5f3041]">
                      {formatCurrency(item.subtotal)}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(item.productoId)}
                      className="inline-flex items-center gap-1 text-sm font-medium text-danger"
                    >
                      <Trash2 className="h-4 w-4" />
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
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#b85f79] shadow-sm">
              <UserRound className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-[#5f3041]">Dejanos tus datos</h3>
              <p className="text-sm text-[#7f5b67]">
                Solo lo justo para reconocer tu pedido y coordinar contigo.
              </p>
            </div>
          </div>

          {autoFillMessage ? (
            <div
              aria-live="polite"
              className="flex items-start gap-2 rounded-2xl border border-[#eecbd5] bg-white px-4 py-3 text-sm text-[#7f5b67]"
            >
              <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#b85f79]" />
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
            placeholder="Ejemplo: Finanzas, recepcion o piso 3"
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
          className="inline-flex w-full items-center justify-center gap-2 rounded-[24px] bg-[#b85f79] px-4 py-4 text-base font-semibold text-white transition hover:bg-[#a8526c] disabled:cursor-not-allowed disabled:bg-[#ddb7c2]"
        >
          <ShoppingBag className="h-5 w-5" />
          {submitting ? "Enviando pedido..." : "Confirmar pedido"}
        </button>
        {serverError ? <p className="text-sm text-danger">{serverError}</p> : null}
      </form>

      <aside className="space-y-4 xl:sticky xl:top-6 xl:h-fit">
        <div className="overflow-hidden rounded-[30px] border border-[#f0d6da] bg-white/95 shadow-soft">
          <div className="bg-[linear-gradient(180deg,#fff1f4_0%,#fff8fa_100%)] p-5">
            <h3 className="text-lg font-semibold text-[#5f3041]">Resumen de compra</h3>
            <p className="mt-1 text-sm text-[#7f5b67]">
              Mira el total y confirma con tranquilidad antes de enviar.
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
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fff4f7] text-[#b85f79]">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-[#5f3041]">Compra protegida</h3>
              <p className="text-sm text-[#7f5b67]">
                Desde esta vista solo puedes crear pedidos nuevos.
              </p>
            </div>
          </div>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-[#7f5b67]">
            <li>Los estados de pedido y pago se controlan solo en el panel interno.</li>
            <li>Aplicamos validacion de celular chileno y limite de intentos.</li>
            <li>Tus datos se guardan en este navegador solo para facilitar el proximo pedido.</li>
          </ul>
        </div>

        <div className="rounded-[30px] border border-[#f0d6da] bg-white/95 p-5 shadow-soft">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fff4f7] text-[#b85f79]">
              <PackageOpen className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-[#5f3041]">Antes de enviar</h3>
              <p className="text-sm text-[#7f5b67]">
                Un ultimo vistazo y listo.
              </p>
            </div>
          </div>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-[#7f5b67]">
            <li>Escoge todo lo que quieras en un solo pedido.</li>
            <li>Ajusta cantidades al momento, sin recargar la pagina.</li>
            <li>Luego te confirmamos directo por telefono.</li>
          </ul>
        </div>

        {submitted ? (
          <div className="rounded-[30px] border border-success/30 bg-white/95 p-5 shadow-soft">
            <p className="flex items-center gap-2 font-semibold text-success">
              <BadgeCheck className="h-5 w-5" />
              Pedido registrado correctamente.
            </p>
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
            className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-[#b85f79] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#a8526c] disabled:cursor-not-allowed disabled:bg-[#ddb7c2]"
          >
            <ShoppingBag className="h-4 w-4" />
            {submitting ? "Enviando..." : "Enviar pedido"}
          </button>
        </div>
      </div>
    </section>
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
      <span className="text-sm font-medium text-[#5f3041]">{label}</span>
      <div className="flex items-center gap-3 rounded-[18px] border border-[#f0d6da] bg-white px-4 py-3 transition focus-within:border-[#d37b94]">
        {icon ? <span className="text-[#b797a2]">{icon}</span> : null}
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="w-full border-0 bg-transparent p-0 text-base text-[#5f3041] outline-none placeholder:text-[#b797a2]"
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
      <span className="text-sm font-medium text-[#5f3041]">{label}</span>
      <div className="flex items-center gap-3 rounded-[18px] border border-[#f0d6da] bg-white px-4 py-3 transition focus-within:border-[#d37b94]">
        <Phone className="h-4 w-4 text-[#b797a2]" />
        <span className="text-sm font-semibold text-[#8b6a74]">+56</span>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="9 1234 5678"
          autoComplete="tel"
          inputMode="tel"
          className="w-full border-0 bg-transparent p-0 text-base text-[#5f3041] outline-none placeholder:text-[#b797a2]"
        />
      </div>
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
      className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#f0d6da] bg-white text-[#5f3041] transition hover:border-[#d37b94] hover:text-[#b85f79]"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
