"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeCheck,
  Building2,
  Clock3,
  Phone,
  ShieldCheck,
  ShoppingBag,
  UserRound,
  X
} from "lucide-react";
import { AppFooter } from "@/components/AppFooter";
import { CartSummary } from "@/components/shared/CartSummary";
import { ProductCatalog } from "@/components/shared/ProductCatalog";
import { AppToast } from "@/components/shared/AppToast";
import { formatChileanMobileInput, parseChileanMobilePhone } from "@/lib/chile-phone";
import { normalizeCustomerLookupValue } from "@/lib/customers/identity";
import { getTomorrowLocalDate } from "@/lib/date";
import { formatCurrency } from "@/lib/format";
import { calcularTotalPedido, normalizarProductoParaCarrito } from "@/lib/order-helpers";
import { getAvailableProductStock } from "@/lib/stock";
import type { CustomerOrderResponse, ProductRecord } from "@/lib/types";
import { type CustomerFormData, validateCustomerOrderForm } from "@/lib/validators";

function createInitialForm(): CustomerFormData {
  return {
    nombre: "",
    telefono: "",
    lugarTrabajo: "",
    fechaEntrega: getTomorrowLocalDate(),
    items: [],
    contactoOculto: ""
  };
}

const RECENT_CUSTOMERS_STORAGE_KEY = "pauli-store-recent-customers";

type SavedCustomerProfile = {
  nombre: string;
  telefono: string;
  lugarTrabajo: string;
  lastUsedAt: string;
};

type ToastState = {
  message: string;
  tone: "success" | "error" | "info";
};

type ValidationTarget =
  | "cart"
  | "nombre"
  | "celular"
  | "lugar"
  | "fecha"
  | "stock"
  | "general";

type ValidationFeedback = {
  ok: boolean;
  field?: ValidationTarget;
  message?: string;
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
  const [form, setForm] = useState<CustomerFormData>(() => createInitialForm());
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [recentCustomers, setRecentCustomers] = useState<SavedCustomerProfile[]>([]);
  const [submitted, setSubmitted] = useState<CustomerOrderResponse | null>(null);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState("");
  const [autoFillMessage, setAutoFillMessage] = useState("");
  const [lastAutoFilledPhone, setLastAutoFilledPhone] = useState("");
  const [toast, setToast] = useState<ToastState | null>(null);
  const [isCartSheetOpen, setIsCartSheetOpen] = useState(false);
  const [highlightedArea, setHighlightedArea] = useState<ValidationTarget | null>(null);

  const catalogRef = useRef<HTMLDivElement | null>(null);
  const formRef = useRef<HTMLDivElement | null>(null);
  const summaryRef = useRef<HTMLDivElement | null>(null);
  const nombreRef = useRef<HTMLInputElement | null>(null);
  const telefonoRef = useRef<HTMLInputElement | null>(null);
  const lugarRef = useRef<HTMLInputElement | null>(null);
  const fechaRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadProducts() {
      try {
        setLoadingProducts(true);
        const response = await fetch("/api/products", {
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache"
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
          setProducts(data.products ?? []);
        }
      } catch (error) {
        if (!cancelled) {
          setServerError(
            error instanceof Error ? error.message : "No fue posible cargar productos."
          );
          showToast("No se pudo registrar el pedido. Revisa los datos e intenta nuevamente.", "error");
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

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => {
      setToast(null);
    }, 3600);

    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!highlightedArea) {
      return;
    }

    const timer = window.setTimeout(() => {
      setHighlightedArea(null);
    }, 2200);

    return () => window.clearTimeout(timer);
  }, [highlightedArea]);

  const validation = validateCustomerOrderForm(form, products);

  const cartLines = useMemo(
    () => normalizarProductoParaCarrito(form.items, products),
    [form.items, products]
  );

  const quantitiesByProduct = useMemo(
    () => Object.fromEntries(form.items.map((item) => [item.productoId, item.cantidad])),
    [form.items]
  );

  function getCartTotal() {
    return calcularTotalPedido(cartLines);
  }

  function getCartItemCount() {
    return form.items.reduce((sum, item) => sum + item.cantidad, 0);
  }

  const total = getCartTotal();
  const itemCount = getCartItemCount();
  const suggestedRecentCustomers = useMemo(() => {
    const normalizedName = normalizeCustomerLookupValue(form.nombre);
    const normalizedPhone = form.telefono.replace(/\D/g, "");
    const normalizedWorkplace = normalizeCustomerLookupValue(form.lugarTrabajo);

    if (!normalizedName && !normalizedPhone && !normalizedWorkplace) {
      return [];
    }

    return recentCustomers.filter((customer) => {
      const customerPhone = customer.telefono.replace(/\D/g, "");
      return (
        (normalizedName &&
          normalizeCustomerLookupValue(customer.nombre).includes(normalizedName)) ||
        (normalizedPhone && customerPhone.includes(normalizedPhone)) ||
        (normalizedWorkplace &&
          normalizeCustomerLookupValue(customer.lugarTrabajo).includes(normalizedWorkplace))
      );
    });
  }, [form.lugarTrabajo, form.nombre, form.telefono, recentCustomers]);

  function showToast(message: string, tone: ToastState["tone"]) {
    setToast({ message, tone });
  }

  function setItemQuantity(productId: string, nextQuantity: number) {
    const product = products.find((item) => item.id === productId);

    if (!product) {
      return;
    }

    const maxAvailable = getAvailableProductStock(product);

    if (maxAvailable <= 0) {
      showToast("No queda stock suficiente para esa cantidad.", "error");
      return;
    }

    if (nextQuantity > maxAvailable) {
      setForm((current) => ({
        ...current,
        items: current.items.map((item) =>
          item.productoId === productId ? { ...item, cantidad: maxAvailable } : item
        )
      }));
      showToast("No queda stock suficiente para esa cantidad.", "error");
      return;
    }

    if (nextQuantity <= 0) {
      removeItem(productId);
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

  function addItem(product: ProductRecord) {
    setServerError("");

    if (getAvailableProductStock(product) <= 0) {
      showToast("No queda stock suficiente para esa cantidad.", "error");
      return;
    }

    setForm((current) => {
      const existing = current.items.find((item) => item.productoId === product.id);
      const nextQuantity = (existing?.cantidad ?? 0) + 1;

      if (nextQuantity > getAvailableProductStock(product)) {
        showToast("No queda stock suficiente para esa cantidad.", "error");
        return current;
      }

      showToast(existing ? "Cantidad actualizada." : "Agregado al pedido.", "success");

      if (existing) {
        return {
          ...current,
          items: current.items.map((item) =>
            item.productoId === product.id ? { ...item, cantidad: item.cantidad + 1 } : item
          )
        };
      }

      return {
        ...current,
        items: [...current.items, { productoId: product.id, cantidad: 1 }]
      };
    });
  }

  function incrementItem(productId: string) {
    const currentItem = form.items.find((item) => item.productoId === productId);
    const product = products.find((item) => item.id === productId);

    if (!currentItem || !product) {
      return;
    }

    if (currentItem.cantidad + 1 > getAvailableProductStock(product)) {
      setItemQuantity(productId, currentItem.cantidad + 1);
      return;
    }

    setItemQuantity(productId, currentItem.cantidad + 1);
    showToast("Cantidad actualizada.", "success");
  }

  function decrementItem(productId: string) {
    const currentItem = form.items.find((item) => item.productoId === productId);

    if (!currentItem) {
      return;
    }

    const nextQuantity = currentItem.cantidad - 1;

    if (nextQuantity <= 0) {
      removeItem(productId);
      return;
    }

    setItemQuantity(productId, nextQuantity);
    showToast("Cantidad actualizada.", "info");
  }

  function removeItem(productId: string) {
    setForm((current) => ({
      ...current,
      items: current.items.filter((item) => item.productoId !== productId)
    }));
    showToast("Producto quitado del pedido.", "info");
  }

  function updateItemFromSummary(productId: string, nextQuantity: number) {
    const currentItem = form.items.find((item) => item.productoId === productId);

    if (!currentItem) {
      return;
    }

    if (nextQuantity <= 0) {
      removeItem(productId);
      return;
    }

    setItemQuantity(productId, nextQuantity);
    showToast("Cantidad actualizada.", "info");
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

  function resolveValidationFeedback(): ValidationFeedback {
    if (form.items.length === 0 || total <= 0) {
      return {
        ok: false,
        field: "cart",
        message: "Primero agrega al menos un producto al pedido."
      };
    }

    if (!form.nombre.trim()) {
      return {
        ok: false,
        field: "nombre",
        message: "Falta tu nombre para registrar el pedido."
      };
    }

    if (!form.telefono.trim()) {
      return {
        ok: false,
        field: "celular",
        message: "Falta tu celular para que Pauli pueda confirmar el pedido."
      };
    }

    if (!form.lugarTrabajo.trim()) {
      return {
        ok: false,
        field: "lugar",
        message: "Falta tu lugar de trabajo o entrega."
      };
    }

    if (!form.fechaEntrega.trim()) {
      return {
        ok: false,
        field: "fecha",
        message: "Falta la fecha estimada de entrega."
      };
    }

    const firstItemWithoutStock = form.items.find((item) => {
      const product = products.find((productCandidate) => productCandidate.id === item.productoId);
      return !product || item.cantidad > getAvailableProductStock(product);
    });

    if (firstItemWithoutStock) {
      return {
        ok: false,
        field: "stock",
        message: "No queda stock suficiente para esa cantidad."
      };
    }

    if (!validation.isValid) {
      if (validation.errors.telefono) {
        return {
          ok: false,
          field: "celular",
          message: validation.errors.telefono
        };
      }

      if (validation.errors.nombre) {
        return {
          ok: false,
          field: "nombre",
          message: validation.errors.nombre
        };
      }

      if (validation.errors.lugarTrabajo) {
        return {
          ok: false,
          field: "lugar",
          message: validation.errors.lugarTrabajo
        };
      }

      if (validation.errors.fechaEntrega) {
        return {
          ok: false,
          field: "fecha",
          message: validation.errors.fechaEntrega
        };
      }

      if (validation.errors.items) {
        return {
          ok: false,
          field: "cart",
          message: validation.errors.items
        };
      }

      return {
        ok: false,
        field: "general",
        message: "No se pudo registrar el pedido. Revisa los datos e intenta nuevamente."
      };
    }

    return { ok: true };
  }

  function focusValidationTarget(field: ValidationTarget) {
    setHighlightedArea(field);

    if (field === "cart" || field === "stock") {
      setIsCartSheetOpen(false);
      catalogRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });

    const target =
      field === "nombre"
        ? nombreRef.current
        : field === "celular"
          ? telefonoRef.current
        : field === "lugar"
            ? lugarRef.current
            : field === "fecha"
              ? fechaRef.current
              : null;

    if (target) {
      window.setTimeout(() => target.focus(), 250);
    }
  }

  function scrollToForm() {
    setIsCartSheetOpen(false);
    setToast(null);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => nombreRef.current?.focus(), 250);
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setServerError("");

    const validationFeedback = resolveValidationFeedback();

    if (!validationFeedback.ok) {
      setSubmitted(null);
      showToast(
        validationFeedback.message ??
          "No se pudo registrar el pedido. Revisa los datos e intenta nuevamente.",
        "error"
      );
      if (validationFeedback.field) {
        focusValidationTarget(validationFeedback.field);
      }
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
      setForm(createInitialForm());
      setIsCartSheetOpen(false);
      showToast("Pedido registrado. Pauli confirmará disponibilidad por WhatsApp.", "success");
    } catch (error) {
      setSubmitted(null);
      const message =
        error instanceof Error
          ? error.message
          : "No se pudo registrar el pedido. Revisa los datos e intenta nuevamente.";
      setServerError(message);
      showToast("No se pudo registrar el pedido. Revisa los datos e intenta nuevamente.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {toast ? (
        <AppToast
          message={toast.message}
          tone={toast.tone}
          onClose={() => setToast(null)}
        />
      ) : null}

      <section
        id="hacer-pedido"
        className="grid w-full max-w-full min-w-0 gap-6 scroll-mt-6 overflow-x-hidden pb-[calc(180px+env(safe-area-inset-bottom))] xl:grid-cols-[1.2fr_0.8fr] xl:pb-6"
      >
        <form
          id="customer-order-form"
          method="post"
          className="max-w-full space-y-6 overflow-x-hidden rounded-[30px] border border-[#d8ebdd] bg-white/95 p-5 shadow-soft backdrop-blur sm:p-6"
          onSubmit={handleSubmit}
        >
          <div className="rounded-[26px] border border-[#d8ebdd] bg-[linear-gradient(135deg,#f8fdf9_0%,#eef8f0_100%)] p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#247a4d]">
                Pedido guiado
              </div>
              <p className="text-sm text-[#6b7c70]">Elige, completa tus datos y envía en menos de un minuto.</p>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <StepChip step="1" title="Elige productos" text="Suma tus favoritos del día." />
              <StepChip step="2" title="Completa tus datos" text="Así Pauli te ubica rápido." />
              <StepChip step="3" title="Envía tu pedido" text="La confirmación llega por WhatsApp." />
            </div>
          </div>

          {recentCustomers.length > 0 ? (
            <div className="rounded-[26px] border border-[#d8ebdd] bg-[#f6fcf7] p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#3fa66b] shadow-sm">
                  <Clock3 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-[#1f3328]">Clientes frecuentes</h3>
                  <p className="text-sm text-[#6b7c70]">
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
                    <div className="text-sm font-semibold text-[#1f3328]">{customer.nombre}</div>
                    <div className="text-xs text-[#6b7c70]">{customer.lugarTrabajo}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div
            ref={catalogRef}
            id="catalogo-section"
            className={`space-y-4 rounded-[26px] border p-4 sm:p-5 ${
              highlightedArea === "cart" || highlightedArea === "stock"
                ? "border-[#3fa66b] bg-[#eef8f0] ring-4 ring-[#ddf4e5]"
                : "border-[#d8ebdd] bg-[linear-gradient(180deg,#eef8f0_0%,#f8fcf8_100%)]"
            }`}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#3fa66b] shadow-sm">
                  <ShoppingBag className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#247a4d]">
                    Paso 1
                  </div>
                  <h3 className="text-lg font-semibold text-[#1f3328]">Catálogo del día</h3>
                  <p className="text-sm text-[#6b7c70]">
                    Elige tus favoritos del catálogo y suma lo que necesites.
                  </p>
                </div>
              </div>
              {loadingProducts ? <span className="text-sm text-[#6b7c70]">Cargando...</span> : null}
            </div>
            <ProductCatalog
              products={products}
              quantities={quantitiesByProduct}
              onAdd={(productId) => {
                const product = products.find((item) => item.id === productId);
                const existing = form.items.find((item) => item.productoId === productId);

                if (product && existing) {
                  incrementItem(productId);
                } else if (product) {
                  addItem(product);
                }
              }}
              onDecrease={decrementItem}
              onRemove={removeItem}
            />
            {validation.errors.items ? (
              <p className="text-sm text-danger">{validation.errors.items}</p>
            ) : null}
          </div>

          <div
            ref={formRef}
            id="pedido-form"
            className={`space-y-4 rounded-[26px] border p-4 sm:p-5 ${
              highlightedArea === "nombre" ||
              highlightedArea === "celular" ||
              highlightedArea === "lugar"
                ? "border-[#3fa66b] bg-[#f3faf4] ring-4 ring-[#ddf4e5]"
                : "border-[#d8ebdd] bg-[#f6fcf7]"
            }`}
          >
            <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#3fa66b] shadow-sm">
                  <UserRound className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#247a4d]">
                    Paso 2
                  </div>
                  <h3 className="text-lg font-semibold text-[#1f3328]">Tus datos</h3>
                  <p className="text-sm text-[#6b7c70]">
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

            {suggestedRecentCustomers.length > 0 ? (
              <div className="rounded-[22px] border border-[#d8ebdd] bg-white px-4 py-4">
                <div className="text-sm font-semibold text-[#1f3328]">
                  Usar cliente existente
                </div>
                <div className="mt-3 flex flex-wrap gap-3">
                  {suggestedRecentCustomers.slice(0, 3).map((customer) => (
                    <button
                      key={`${customer.telefono}-${customer.nombre}`}
                      type="button"
                      onClick={() => applyRecentCustomer(customer)}
                      className="rounded-full border border-[#d8ebdd] bg-[#f6fcf7] px-4 py-2 text-sm font-semibold text-[#247a4d] transition hover:border-[#3fa66b]"
                    >
                      {customer.nombre}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <TextField
                id="input-nombre"
                inputRef={nombreRef}
                label="Nombre del cliente"
                value={form.nombre}
                onChange={(value) => setForm((current) => ({ ...current, nombre: value }))}
                error={validation.errors.nombre}
                placeholder="Ejemplo: Rodrigo Riedmann"
                autoComplete="name"
                icon={<UserRound className="h-4 w-4" />}
                highlighted={highlightedArea === "nombre"}
              />
              <PhoneField
                id="input-celular"
                inputRef={telefonoRef}
                label="Celular de contacto"
                value={form.telefono}
                onChange={handlePhoneChange}
                error={validation.errors.telefono}
                highlighted={highlightedArea === "celular"}
              />
            </div>
            <TextField
              id="input-lugar"
              inputRef={lugarRef}
              label="Lugar de trabajo"
              value={form.lugarTrabajo}
              onChange={(value) => setForm((current) => ({ ...current, lugarTrabajo: value }))}
              error={validation.errors.lugarTrabajo}
              placeholder="Ejemplo: Finanzas, recepción o piso 3"
              autoComplete="organization"
              icon={<Building2 className="h-4 w-4" />}
              highlighted={highlightedArea === "lugar"}
            />
            <label className="block space-y-2">
              <span className="text-sm font-medium text-[#1f3328]">Fecha de entrega</span>
              <div
                className={`flex items-center gap-3 rounded-[18px] border bg-white px-4 py-3 transition ${
                  highlightedArea === "fecha"
                    ? "border-[#3fa66b] ring-4 ring-[#ddf4e5]"
                    : "border-[#d8ebdd] focus-within:border-[#3fa66b]"
                }`}
              >
                <Clock3 className="h-4 w-4 text-[#6b7c70]" />
                <input
                  id="input-fecha-entrega"
                  ref={fechaRef}
                  type="date"
                  value={form.fechaEntrega}
                  min={getTomorrowLocalDate(new Date(Date.now() - 24 * 60 * 60 * 1000))}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      fechaEntrega: event.target.value
                    }))
                  }
                  className="w-full border-0 bg-transparent p-0 text-base text-[#1f3328] outline-none"
                />
              </div>
              {validation.errors.fechaEntrega ? (
                <span className="text-sm text-danger">{validation.errors.fechaEntrega}</span>
              ) : (
                <span className="text-xs text-[#6b7c70]">
                  Sugerimos mañana por defecto, pero puedes cambiarla.
                </span>
              )}
            </label>
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

          <div className="rounded-[26px] border border-[#d8ebdd] bg-[linear-gradient(135deg,#f8fdf9_0%,#f1f9f3_100%)] p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[#3fa66b] shadow-sm">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#247a4d]">
                  Paso 3
                </div>
                <h3 className="text-lg font-semibold text-[#1f3328]">Envía tu pedido</h3>
                <p className="text-sm leading-6 text-[#6b7c70]">
                  Tu pedido queda pendiente hasta que Pauli confirme stock, horario y entrega por WhatsApp.
                </p>
              </div>
            </div>
            <button
              type="submit"
              disabled={submitting || loadingProducts || products.length === 0}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[24px] bg-[#3fa66b] px-4 py-4 text-base font-semibold text-white shadow-[0_16px_30px_rgba(63,166,107,0.2)] transition hover:bg-[#247a4d] disabled:cursor-not-allowed disabled:bg-[#a8d8b7]"
            >
              <ShoppingBag className="h-5 w-5" />
              {submitting ? "Enviando pedido..." : "Enviar pedido a Pauli"}
            </button>
          </div>
          {serverError ? <p className="text-sm text-danger">{serverError}</p> : null}
        </form>

        <aside className="hidden max-w-full space-y-4 xl:sticky xl:top-6 xl:block xl:h-fit">
          <div ref={summaryRef} id="pedido-resumen">
            <CartSummary
              lines={cartLines}
              total={total}
              totalItems={itemCount}
              onDecrease={updateItemFromSummary}
              onIncrease={updateItemFromSummary}
              onRemove={removeItem}
              emptyText="Tu resumen aparecerá apenas elijas algo del catálogo."
            />
          </div>

          <div className="rounded-[30px] border border-[#d8ebdd] bg-white/95 p-5 shadow-soft">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f6fcf7] text-[#3fa66b]">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[#1f3328]">Pedido simple</h3>
                <p className="text-sm text-[#6b7c70]">
                  Tu pedido queda pendiente de confirmación. Pauli revisa stock y luego te escribe.
                </p>
              </div>
            </div>
          </div>
        </aside>
      </section>

      {itemCount > 0 ? (
        <div className="fixed inset-x-4 bottom-[calc(16px+env(safe-area-inset-bottom))] z-40 mx-auto max-w-xl xl:hidden">
          <div className="flex items-center justify-between gap-4 rounded-[26px] border border-[#d7f0df] bg-[linear-gradient(135deg,#1d5f3c_0%,#247a4d_55%,#3fa66b_100%)] px-4 py-3 text-white shadow-[0_22px_46px_rgba(31,51,40,0.28)]">
            <div className="flex min-w-0 items-center gap-3">
              <span className="cart-count-badge shrink-0 border border-white/20 bg-[#fff3] text-white">
                {itemCount}
              </span>
              <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wide text-white/75">
                {itemCount} producto{itemCount === 1 ? "" : "s"} · {formatCurrency(total)}
              </div>
              <div className="truncate text-sm font-medium text-white/90">
                Tu pedido está listo para revisarlo.
              </div>
            </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setToast(null);
                setIsCartSheetOpen(true);
              }}
              className="inline-flex min-h-11 shrink-0 items-center rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-[#1d5f3c] shadow-[0_10px_24px_rgba(0,0,0,0.12)]"
            >
                Revisar
              </button>
            </div>
          </div>
      ) : null}

      {isCartSheetOpen ? (
        <div className="fixed inset-0 z-50 flex items-end bg-[#1f3328]/35 xl:hidden">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Cerrar resumen del pedido"
            onClick={() => setIsCartSheetOpen(false)}
          />
          <div className="relative w-full rounded-t-[32px] border border-[#d8ebdd] bg-white px-4 pb-[calc(24px+env(safe-area-inset-bottom))] pt-4 shadow-[0_-20px_50px_rgba(31,51,40,0.18)]">
            <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-[#d8ebdd]" />
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold text-[#1f3328]">Tu pedido</h3>
                <p className="text-sm text-[#6b7c70]">
                  Revisa cantidades, total y después completa tus datos.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCartSheetOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d8ebdd] bg-white text-[#1f3328]"
                aria-label="Cerrar carrito"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div ref={summaryRef} id="pedido-resumen" className="max-h-[70dvh] overflow-y-auto pr-1">
              <CartSummary
                lines={cartLines}
                total={total}
                totalItems={itemCount}
                onDecrease={updateItemFromSummary}
                onIncrease={updateItemFromSummary}
                onRemove={removeItem}
                emptyText="Tu resumen aparecerá apenas elijas algo del catálogo."
                footer={
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setIsCartSheetOpen(false)}
                      className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-[#d8ebdd] bg-white px-4 py-3 text-sm font-semibold text-[#1f3328]"
                    >
                      Seguir agregando
                    </button>
                    <button
                      type="button"
                      onClick={scrollToForm}
                      className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#3fa66b] px-4 py-3 text-sm font-semibold text-white"
                    >
                      Completar datos
                    </button>
                  </div>
                }
              />
            </div>
          </div>
        </div>
      ) : null}

      <AppFooter className="pb-[calc(180px+env(safe-area-inset-bottom))] xl:pb-6" />

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
                <p className="text-sm leading-6 text-[#6b7c70]">
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
    </>
  );
}

function StepChip({ step, title, text }: { step: string; title: string; text: string }) {
  return (
    <div className="rounded-[22px] border border-[#d8ebdd] bg-white/85 p-4 shadow-[0_10px_24px_rgba(31,51,40,0.06)]">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#3fa66b] text-sm font-bold text-white">
          {step}
        </div>
        <div>
          <div className="text-sm font-semibold text-[#1f3328]">{title}</div>
          <div className="text-xs leading-5 text-[#6b7c70]">{text}</div>
        </div>
      </div>
    </div>
  );
}

type TextFieldProps = {
  id: string;
  label: string;
  value: string;
  error?: string;
  placeholder?: string;
  autoComplete?: string;
  icon?: React.ReactNode;
  highlighted?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onChange: (value: string) => void;
};

function TextField({
  id,
  label,
  value,
  error,
  placeholder,
  autoComplete,
  icon,
  highlighted = false,
  inputRef,
  onChange
}: TextFieldProps) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-[#1f3328]">{label}</span>
      <div
        className={`flex items-center gap-3 rounded-[18px] border bg-white px-4 py-3 transition ${
          highlighted ? "border-[#3fa66b] ring-4 ring-[#ddf4e5]" : "border-[#d8ebdd] focus-within:border-[#3fa66b]"
        }`}
      >
        {icon ? <span className="text-[#6b7c70]">{icon}</span> : null}
        <input
          id={id}
          ref={inputRef}
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
  id: string;
  label: string;
  value: string;
  error?: string;
  highlighted?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onChange: (value: string) => void;
};

function PhoneField({
  id,
  label,
  value,
  error,
  highlighted = false,
  inputRef,
  onChange
}: PhoneFieldProps) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-[#1f3328]">{label}</span>
      <div
        className={`flex items-center gap-3 rounded-[18px] border bg-white px-4 py-3 transition ${
          highlighted ? "border-[#3fa66b] ring-4 ring-[#ddf4e5]" : "border-[#d8ebdd] focus-within:border-[#3fa66b]"
        }`}
      >
        <Phone className="h-4 w-4 text-[#6b7c70]" />
        <span className="text-sm font-semibold text-[#247a4d]">+56</span>
        <input
          id={id}
          ref={inputRef}
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
