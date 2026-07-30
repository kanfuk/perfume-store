"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeCheck,
  Home,
  Mail,
  Phone,
  ShieldCheck,
  ShoppingBag,
  Truck,
  UserRound,
  X
} from "lucide-react";
import { AppFooter } from "@/components/AppFooter";
import { CartSummary } from "@/components/shared/CartSummary";
import { TopProductsSection } from "@/components/shared/TopProductsSection";
import { OffersSection } from "@/components/shared/OffersSection";
import { CatalogExplorer } from "@/components/shared/CatalogExplorer";
import { AppToast } from "@/components/shared/AppToast";
import { formatChileanMobileInput, parseChileanMobilePhone } from "@/lib/chile-phone";
import { groupProductsIntoFamilies, getTopFamilies } from "@/lib/product-families";
import {
  CHILE_REGIONS,
  getCommunesForRegion,
  isValidChileCommuneForRegion,
  isValidChileRegion,
  updateChileRegionSelection
} from "@/lib/chile-locations";
import {
  calcularCostoDespacho,
  METODO_DESPACHO_DOMICILIO_SEMANAL,
  METODO_DESPACHO_LABELS,
  METODO_DESPACHO_STARKEN_POR_PAGAR,
  TOP_PRODUCTS_LIMIT
} from "@/lib/constants";
import { normalizeCustomerLookupValue } from "@/lib/customers/identity";
import { formatCurrency } from "@/lib/format";
import { normalizarProductoParaCarrito } from "@/lib/order-helpers";
import { getAvailableProductStock } from "@/lib/stock";
import type { CustomerOrderResponse, ProductRecord } from "@/lib/types";
import { type CustomerFormData, validateCustomerOrderForm } from "@/lib/validators";

function createInitialForm(): CustomerFormData {
  return {
    nombre: "",
    rut: "",
    email: "",
    telefono: "",
    region: "",
    comuna: "",
    direccion: "",
    referenciaDireccion: "",
    metodoDespacho: METODO_DESPACHO_STARKEN_POR_PAGAR,
    observacion: "",
    items: [],
    contactoOculto: ""
  };
}

const RECENT_CUSTOMERS_STORAGE_KEY = "perfume-store-recent-customers";

type SavedCustomerProfile = {
  nombre: string;
  telefono: string;
  rut: string;
  email: string;
  region: string;
  comuna: string;
  direccion: string;
  lastUsedAt: string;
};

type ToastState = {
  message: string;
  tone: "success" | "error" | "info";
};

type ValidationTarget =
  | "cart"
  | "nombre"
  | "rut"
  | "email"
  | "celular"
  | "region"
  | "comuna"
  | "direccion"
  | "despacho"
  | "stock"
  | "general";

type ValidationFeedback = {
  ok: boolean;
  field?: ValidationTarget;
  message?: string;
};

type CartCtaCopy = {
  message: string;
  buttonLabel: string;
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
      (item) => typeof item?.nombre === "string" && typeof item?.telefono === "string"
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
    rut: form.rut.trim(),
    email: form.email.trim(),
    region: form.region.trim(),
    comuna: form.comuna.trim(),
    direccion: form.direccion.trim(),
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
  const rutRef = useRef<HTMLInputElement | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);
  const telefonoRef = useRef<HTMLInputElement | null>(null);
  const regionRef = useRef<HTMLSelectElement | null>(null);
  const comunaRef = useRef<HTMLSelectElement | null>(null);
  const direccionRef = useRef<HTMLInputElement | null>(null);

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

  const catalogQuantities = useMemo(
    () => Object.fromEntries(form.items.map((item) => [item.productoId, item.cantidad])),
    [form.items]
  );

  const topFamilyKeys = useMemo(() => {
    const families = groupProductsIntoFamilies(products);
    return new Set(getTopFamilies(families, TOP_PRODUCTS_LIMIT).map((entry) => entry.family.key));
  }, [products]);

  function handleAddToCatalog(productId: string) {
    const product = products.find((item) => item.id === productId);
    const existing = form.items.find((item) => item.productoId === productId);

    if (product && existing) {
      incrementItem(productId);
    } else if (product) {
      addItem(product);
    }
  }

  function getCartItemCount() {
    return form.items.reduce((sum, item) => sum + item.cantidad, 0);
  }

  const subtotal = cartLines.reduce((sum, line) => sum + line.subtotal, 0);
  const costoDespacho = calcularCostoDespacho(form.metodoDespacho);
  const total = subtotal + costoDespacho;
  const itemCount = getCartItemCount();
  const suggestedRecentCustomers = useMemo(() => {
    const normalizedName = normalizeCustomerLookupValue(form.nombre);
    const normalizedPhone = form.telefono.replace(/\D/g, "");

    if (!normalizedName && !normalizedPhone) {
      return [];
    }

    return recentCustomers.filter((customer) => {
      const customerPhone = customer.telefono.replace(/\D/g, "");
      return (
        (normalizedName &&
          normalizeCustomerLookupValue(customer.nombre).includes(normalizedName)) ||
        (normalizedPhone && customerPhone.includes(normalizedPhone))
      );
    });
  }, [form.nombre, form.telefono, recentCustomers]);
  const communeOptions = useMemo(() => getCommunesForRegion(form.region), [form.region]);

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
    const savedRegion = isValidChileRegion(customer.region) ? customer.region : "";
    const savedCommune = isValidChileCommuneForRegion(savedRegion, customer.comuna)
      ? customer.comuna
      : "";

    setForm((current) => ({
      ...current,
      nombre: customer.nombre,
      telefono: parsedPhone ? formatChileanMobileInput(parsedPhone.national) : current.telefono,
      rut: customer.rut || current.rut,
      email: customer.email || current.email,
      region: savedRegion || current.region,
      comuna: savedRegion ? savedCommune : current.comuna,
      direccion: customer.direccion || current.direccion
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

    applyRecentCustomer(matchedCustomer);
  }

  function resolveValidationFeedback(): ValidationFeedback {
    if (form.items.length === 0 || subtotal <= 0) {
      return {
        ok: false,
        field: "cart",
        message: "Primero agrega al menos un producto al pedido."
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
      const fieldOrder: Array<[keyof typeof validation.errors, ValidationTarget]> = [
        ["nombre", "nombre"],
        ["rut", "rut"],
        ["email", "email"],
        ["telefono", "celular"],
        ["region", "region"],
        ["comuna", "comuna"],
        ["direccion", "direccion"],
        ["metodoDespacho", "despacho"],
        ["items", "cart"]
      ];

      for (const [errorKey, field] of fieldOrder) {
        if (validation.errors[errorKey]) {
          return { ok: false, field, message: validation.errors[errorKey] };
        }
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

    const targetRef =
      field === "nombre"
        ? nombreRef
        : field === "rut"
          ? rutRef
          : field === "email"
            ? emailRef
            : field === "celular"
              ? telefonoRef
              : field === "region"
                ? regionRef
                : field === "comuna"
                  ? comunaRef
                  : field === "direccion"
                    ? direccionRef
                    : null;

    if (targetRef?.current) {
      window.setTimeout(() => targetRef.current?.focus(), 250);
    }
  }

  function scrollToForm() {
    setIsCartSheetOpen(false);
    setToast(null);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => nombreRef.current?.focus(), 250);
  }

  async function submitOrder() {
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
      setAutoFillMessage("Guardamos tus datos en este dispositivo para tu próxima reserva.");
      setLastAutoFilledPhone("");
      setForm(createInitialForm());
      setIsCartSheetOpen(false);
      showToast(
        "Reserva registrada. Te contactaremos por WhatsApp para confirmar y coordinar el pago.",
        "success"
      );
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
  }

  const orderValidationFeedback = resolveValidationFeedback();
  const isOrderReadyToSubmit = orderValidationFeedback.ok;
  const cartCtaCopy: CartCtaCopy = isOrderReadyToSubmit
    ? {
        message: "Tu reserva está lista para enviar.",
        buttonLabel: "Enviar reserva"
      }
    : {
        message: "Completa tus datos para enviar la reserva.",
        buttonLabel:
          orderValidationFeedback.field && orderValidationFeedback.field !== "cart" && orderValidationFeedback.field !== "stock"
            ? "Completar datos"
            : "Revisar"
      };

  function handleCartPrimaryAction() {
    if (submitting || loadingProducts) {
      return;
    }

    if (isOrderReadyToSubmit) {
      void submitOrder();
      return;
    }

    if (orderValidationFeedback.field) {
      focusValidationTarget(orderValidationFeedback.field);
      return;
    }

    scrollToForm();
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitOrder();
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
        className={`grid w-full max-w-full min-w-0 gap-8 scroll-mt-6 overflow-x-hidden xl:grid-cols-12 xl:pb-6 ${
          itemCount > 0 ? "pb-[calc(110px+env(safe-area-inset-bottom))]" : "pb-6"
        }`}
      >
        <form
          id="customer-order-form"
          method="post"
          className="max-w-full space-y-8 overflow-x-hidden xl:col-span-7"
          onSubmit={handleSubmit}
        >
          <div id="como-comprar" className="scroll-mt-8 border-b border-[#e4e7ec] pb-8">
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#5434e6]">
                Reserva guiada
              </div>
              <p className="text-sm text-[#667085]">
                Elige tus perfumes, completa tus datos de despacho y envía en minutos.
              </p>
            </div>
            <div className="relative mt-5 grid gap-3 sm:grid-cols-3">
              <div className="absolute left-[12%] right-[12%] top-5 hidden h-px bg-[#dcd6ff] sm:block" />
              <StepChip step="1" title="Elige productos" text="Suma tus perfumes favoritos." />
              <StepChip step="2" title="Datos y despacho" text="Asi coordinamos tu entrega." />
              <StepChip step="3" title="Envía tu reserva" text="Coordinamos pago por WhatsApp." />
            </div>
          </div>

          {recentCustomers.length > 0 ? (
            <div className="rounded-[26px] border border-[#e4e7ec] bg-[#f7f8fa] p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#7357ff] shadow-sm">
                  <BadgeCheck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-[#111318]">Clientes frecuentes</h3>
                  <p className="text-sm text-[#667085]">
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
                    className="max-w-full rounded-full border border-[#e4e7ec] bg-white px-4 py-3 text-left transition hover:border-[#7357ff] hover:shadow-sm"
                  >
                    <div className="text-sm font-semibold text-[#111318]">{customer.nombre}</div>
                    <div className="text-xs text-[#667085]">{customer.comuna || customer.telefono}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div
            ref={catalogRef}
            id="catalogo-section"
            className={`space-y-5 rounded-2xl border bg-white p-5 shadow-soft sm:p-6 ${
              highlightedArea === "cart" || highlightedArea === "stock"
                ? "border-[#7357ff] ring-4 ring-[#eeebff]"
                : "border-[#e4e7ec]"
            }`}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#7357ff] shadow-sm">
                  <ShoppingBag className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#5434e6]">
                    Paso 1
                  </div>
                  <h3 className="text-lg font-semibold text-[#111318]">Catálogo</h3>
                  <p className="text-sm text-[#667085]">
                    Elige tus perfumes favoritos y suma lo que necesites.
                  </p>
                </div>
              </div>
              {loadingProducts ? <span className="text-sm text-[#667085]">Cargando...</span> : null}
            </div>
            <div className="space-y-8">
              <TopProductsSection
                products={products}
                quantities={catalogQuantities}
                onAdd={handleAddToCatalog}
                onDecrease={decrementItem}
                onRemove={removeItem}
              />
              <OffersSection
                products={products}
                quantities={catalogQuantities}
                onAdd={handleAddToCatalog}
                onDecrease={decrementItem}
                onRemove={removeItem}
              />
              <CatalogExplorer
                products={products}
                quantities={catalogQuantities}
                onAdd={handleAddToCatalog}
                onDecrease={decrementItem}
                onRemove={removeItem}
                top12Keys={topFamilyKeys}
              />
            </div>
            {validation.errors.items ? (
              <p className="text-sm text-danger">{validation.errors.items}</p>
            ) : null}
          </div>

          <div
            ref={formRef}
            id="pedido-form"
            className={`space-y-5 rounded-2xl border bg-white p-5 shadow-soft sm:p-6 ${
              highlightedArea && highlightedArea !== "cart" && highlightedArea !== "stock"
                ? "border-[#7357ff] ring-4 ring-[#eeebff]"
                : "border-[#e4e7ec]"
            }`}
          >
            <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#7357ff] shadow-sm">
                  <UserRound className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#5434e6]">
                    Paso 2
                  </div>
                  <h3 className="text-lg font-semibold text-[#111318]">Tus datos</h3>
                  <p className="text-sm text-[#667085]">
                    Los necesitamos para confirmar tu reserva y coordinar el despacho por WhatsApp.
                  </p>
                </div>
            </div>

            {autoFillMessage ? (
              <div
                aria-live="polite"
                className="flex items-start gap-2 rounded-2xl border border-[#e4e7ec] bg-white px-4 py-3 text-sm text-[#667085]"
              >
                <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#7357ff]" />
                <span>{autoFillMessage}</span>
              </div>
            ) : null}

            {suggestedRecentCustomers.length > 0 ? (
              <div className="rounded-[22px] border border-[#e4e7ec] bg-white px-4 py-4">
                <div className="text-sm font-semibold text-[#111318]">
                  Usar cliente existente
                </div>
                <div className="mt-3 flex flex-wrap gap-3">
                  {suggestedRecentCustomers.slice(0, 3).map((customer) => (
                    <button
                      key={`${customer.telefono}-${customer.nombre}`}
                      type="button"
                      onClick={() => applyRecentCustomer(customer)}
                      className="rounded-full border border-[#e4e7ec] bg-[#f7f8fa] px-4 py-2 text-sm font-semibold text-[#5434e6] transition hover:border-[#7357ff]"
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
                label="Nombre completo"
                value={form.nombre}
                onChange={(value) => setForm((current) => ({ ...current, nombre: value }))}
                error={validation.errors.nombre}
                placeholder="Ejemplo: Rodrigo Riedmann"
                autoComplete="name"
                icon={<UserRound className="h-4 w-4" />}
                highlighted={highlightedArea === "nombre"}
              />
              <TextField
                id="input-rut"
                inputRef={rutRef}
                label="RUT"
                value={form.rut}
                onChange={(value) => setForm((current) => ({ ...current, rut: value }))}
                error={validation.errors.rut}
                placeholder="12.345.678-5"
                autoComplete="off"
                icon={<BadgeCheck className="h-4 w-4" />}
                highlighted={highlightedArea === "rut"}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <TextField
                id="input-email"
                inputRef={emailRef}
                label="Correo electrónico"
                value={form.email}
                onChange={(value) => setForm((current) => ({ ...current, email: value }))}
                error={validation.errors.email}
                placeholder="tucorreo@ejemplo.com"
                autoComplete="email"
                type="email"
                icon={<Mail className="h-4 w-4" />}
                highlighted={highlightedArea === "email"}
              />
              <PhoneField
                id="input-celular"
                inputRef={telefonoRef}
                label="Celular o WhatsApp"
                value={form.telefono}
                onChange={handlePhoneChange}
                error={validation.errors.telefono}
                highlighted={highlightedArea === "celular"}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <SelectField
                id="input-region"
                selectRef={regionRef}
                label="Región"
                value={form.region}
                onChange={(value) =>
                  setForm((current) => updateChileRegionSelection(current, value))
                }
                error={validation.errors.region}
                placeholder="Selecciona una región"
                options={CHILE_REGIONS.map((region) => region.name)}
                autoComplete="address-level1"
                highlighted={highlightedArea === "region"}
              />
              <SelectField
                id="input-comuna"
                selectRef={comunaRef}
                label="Comuna"
                value={form.comuna}
                onChange={(value) => setForm((current) => ({ ...current, comuna: value }))}
                error={validation.errors.comuna}
                placeholder="Selecciona una comuna"
                options={communeOptions}
                disabled={!form.region}
                autoComplete="address-level2"
                highlighted={highlightedArea === "comuna"}
              />
            </div>
            <TextField
              id="input-direccion"
              inputRef={direccionRef}
              label="Dirección de despacho"
              value={form.direccion}
              onChange={(value) => setForm((current) => ({ ...current, direccion: value }))}
              error={validation.errors.direccion}
              placeholder="Calle, número, depto/casa"
              autoComplete="street-address"
              icon={<Home className="h-4 w-4" />}
              highlighted={highlightedArea === "direccion"}
            />
            <TextField
              id="input-referencia"
              label="Referencia de dirección (opcional)"
              value={form.referenciaDireccion ?? ""}
              onChange={(value) =>
                setForm((current) => ({ ...current, referenciaDireccion: value }))
              }
              placeholder="Ejemplo: portón negro, entre calles..."
              autoComplete="off"
            />

            <div className="space-y-2">
              <span className="text-sm font-medium text-[#111318]">Método de despacho</span>
              <div className="grid gap-3 sm:grid-cols-2">
                <DespachoOption
                  icon={<Truck className="h-4 w-4" />}
                  label={METODO_DESPACHO_LABELS[METODO_DESPACHO_STARKEN_POR_PAGAR]}
                  helper="Envío por pagar en destino. Coordinamos la sucursal por WhatsApp."
                  active={form.metodoDespacho === METODO_DESPACHO_STARKEN_POR_PAGAR}
                  highlighted={highlightedArea === "despacho"}
                  onSelect={() =>
                    setForm((current) => ({
                      ...current,
                      metodoDespacho: METODO_DESPACHO_STARKEN_POR_PAGAR
                    }))
                  }
                />
                <DespachoOption
                  icon={<Home className="h-4 w-4" />}
                  label={METODO_DESPACHO_LABELS[METODO_DESPACHO_DOMICILIO_SEMANAL]}
                  helper={`Reparto semanal a domicilio. Costo único: ${formatCurrency(
                    calcularCostoDespacho(METODO_DESPACHO_DOMICILIO_SEMANAL)
                  )}. Coordinamos el día por WhatsApp.`}
                  active={form.metodoDespacho === METODO_DESPACHO_DOMICILIO_SEMANAL}
                  highlighted={highlightedArea === "despacho"}
                  onSelect={() =>
                    setForm((current) => ({
                      ...current,
                      metodoDespacho: METODO_DESPACHO_DOMICILIO_SEMANAL
                    }))
                  }
                />
              </div>
            </div>

            <TextField
              id="input-observacion"
              label="Observación del pedido (opcional)"
              value={form.observacion ?? ""}
              onChange={(value) => setForm((current) => ({ ...current, observacion: value }))}
              placeholder="Ejemplo: horario preferido para recibir"
              autoComplete="off"
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

          <div id="pedido-resumen-mobile" className="scroll-mt-6 xl:hidden">
            <CartSummary
              lines={cartLines}
              total={total}
              totalItems={itemCount}
              onDecrease={updateItemFromSummary}
              onIncrease={updateItemFromSummary}
              onRemove={removeItem}
              emptyText="Tu resumen aparecerá cuando elijas una fragancia."
              subtitle="Revisa productos y total antes de confirmar."
              footer={
                <OrderTotalsSummary
                  subtotal={subtotal}
                  costoDespacho={costoDespacho}
                  total={total}
                />
              }
            />
          </div>

          <div className="rounded-2xl border border-[#e4e7ec] bg-white p-5 shadow-soft">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[#7357ff] shadow-sm">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#5434e6]">
                  Paso 3
                </div>
                <h3 className="text-lg font-semibold text-[#111318]">Envía tu reserva</h3>
                <p className="text-sm leading-6 text-[#667085]">
                  Esto es una solicitud de reserva de stock. Te contactaremos por WhatsApp para
                  confirmar disponibilidad y coordinar la transferencia bancaria.
                </p>
              </div>
            </div>
            <button
              type="submit"
              disabled={submitting || loadingProducts || products.length === 0}
              className="app-button-primary mt-4 inline-flex w-full items-center justify-center gap-2 px-4 py-4 text-base font-semibold transition"
            >
              <ShoppingBag className="h-5 w-5" />
              {submitting ? "Enviando reserva..." : "Enviar reserva"}
            </button>
          </div>
          {serverError ? <p className="text-sm text-danger">{serverError}</p> : null}
        </form>

        <aside className="hidden max-w-full space-y-4 xl:sticky xl:top-6 xl:col-span-5 xl:block xl:h-fit">
          <div ref={summaryRef} id="pedido-resumen">
            <CartSummary
              lines={cartLines}
              total={total}
              totalItems={itemCount}
              onDecrease={updateItemFromSummary}
              onIncrease={updateItemFromSummary}
              onRemove={removeItem}
              emptyText="Tu resumen aparecerá apenas elijas algo del catálogo."
              footer={
                <OrderTotalsSummary
                  subtotal={subtotal}
                  costoDespacho={costoDespacho}
                  total={total}
                />
              }
            />
          </div>

          <div className="rounded-[30px] border border-[#e4e7ec] bg-white/95 p-5 shadow-soft">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f7f8fa] text-[#7357ff]">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[#111318]">Reserva de stock</h3>
                <p className="text-sm text-[#667085]">
                  Tu reserva queda pendiente de confirmación. Revisamos disponibilidad y luego te
                  escribimos por WhatsApp.
                </p>
              </div>
            </div>
          </div>
        </aside>
      </section>

      {itemCount > 0 ? (
        <div className="fixed inset-x-4 bottom-[calc(16px+env(safe-area-inset-bottom))] z-40 mx-auto max-w-xl xl:hidden">
          <div className="flex items-center justify-between gap-4 rounded-[26px] border border-[#c1b6ff] bg-[linear-gradient(135deg,#452bb8_0%,#5434e6_55%,#7357ff_100%)] px-4 py-3 text-white shadow-[0_22px_46px_rgba(17,19,24,0.28)]">
            <button
              type="button"
              onClick={() => setIsCartSheetOpen(true)}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
              aria-label="Ver pedido"
            >
              <span className="cart-count-badge shrink-0 border border-white/20 bg-[#fff3] text-white">
                {itemCount}
              </span>
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-wide text-white/75">
                  Ver pedido · {itemCount} producto{itemCount === 1 ? "" : "s"} · {formatCurrency(total)}
                </div>
                <div className="truncate text-sm font-medium text-white/90">
                  {cartCtaCopy.message}
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={handleCartPrimaryAction}
              disabled={submitting || loadingProducts}
              className="inline-flex min-h-11 shrink-0 items-center rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-[#452bb8] shadow-[0_10px_24px_rgba(0,0,0,0.12)] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitting ? "Enviando..." : cartCtaCopy.buttonLabel}
            </button>
          </div>
        </div>
      ) : null}

      {isCartSheetOpen ? (
        <div className="fixed inset-0 z-50 flex items-end bg-[#111318]/35 xl:hidden">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Cerrar resumen del pedido"
            onClick={() => setIsCartSheetOpen(false)}
          />
          <div className="relative w-full rounded-t-[32px] border border-[#e4e7ec] bg-white px-4 pb-[calc(24px+env(safe-area-inset-bottom))] pt-4 shadow-[0_-20px_50px_rgba(17, 19, 24,0.18)]">
            <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-[#e4e7ec]" />
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold text-[#111318]">Tu reserva</h3>
                <p className="text-sm text-[#667085]">
                  {isOrderReadyToSubmit
                    ? "Tu reserva está lista. Puedes enviarla desde aquí."
                    : "Revisa cantidades, total y después completa tus datos."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCartSheetOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#e4e7ec] bg-white text-[#111318]"
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
                  <div className="space-y-3">
                    <OrderTotalsSummary
                      subtotal={subtotal}
                      costoDespacho={costoDespacho}
                      total={total}
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => setIsCartSheetOpen(false)}
                        className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-[#e4e7ec] bg-white px-4 py-3 text-sm font-semibold text-[#111318]"
                      >
                        Seguir agregando
                      </button>
                      <button
                        type="button"
                        onClick={handleCartPrimaryAction}
                        disabled={submitting || loadingProducts}
                        className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#7357ff] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#c1b6ff]"
                      >
                        {submitting ? "Enviando..." : cartCtaCopy.buttonLabel}
                      </button>
                    </div>
                  </div>
                }
              />
            </div>
          </div>
        </div>
      ) : null}

      <AppFooter
        className={itemCount > 0 ? "pb-[calc(100px+env(safe-area-inset-bottom))] xl:pb-6" : "pb-6"}
        showClientCta
      />

      {submitted ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#111318]/30 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[32px] border border-[#e4e7ec] bg-white p-6 shadow-[0_24px_60px_rgba(17, 19, 24,0.18)]">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f5f3ff] text-success">
                <BadgeCheck className="h-6 w-6" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-semibold text-[#111318]">
                  Reserva registrada correctamente
                </h3>
                <p className="text-sm leading-6 text-[#667085]">
                  Tu reserva quedó pendiente de confirmación. Revisaremos disponibilidad y te
                  avisaremos por WhatsApp para coordinar el pago.
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-[22px] border border-[#e4e7ec] bg-[#f7f8fa] p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[#667085]">Código</span>
                <span className="font-medium text-[#111318]">
                  {submitted.codigo ?? submitted.pedidoId}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="text-[#667085]">Subtotal</span>
                <span className="text-[#111318]">{formatCurrency(submitted.subtotal)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-[#667085]">Despacho</span>
                <span className="text-[#111318]">
                  {submitted.metodoDespacho === METODO_DESPACHO_STARKEN_POR_PAGAR
                    ? "Por pagar"
                    : formatCurrency(submitted.costoDespacho)}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="text-[#667085]">Total</span>
                <span className="font-semibold text-[#7357ff]">
                  {formatCurrency(submitted.total)}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSubmitted(null)}
              className="mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-[#7357ff] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#5434e6]"
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
    <div className="relative z-10 bg-[#f7f8fa] py-2 sm:text-center">
      <div className="flex items-center gap-3 sm:flex-col sm:gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-full border-4 border-[#f7f8fa] bg-[#7357ff] text-sm font-bold text-white">
          {step}
        </div>
        <div>
          <div className="text-sm font-semibold text-[#111318]">{title}</div>
          <div className="text-xs leading-5 text-[#667085]">{text}</div>
        </div>
      </div>
    </div>
  );
}

function OrderTotalsSummary({
  subtotal,
  costoDespacho,
  total
}: {
  subtotal: number;
  costoDespacho: number;
  total: number;
}) {
  return (
    <div className="space-y-2 rounded-xl bg-[#f9fafb] px-4 py-3 text-sm">
      <div className="flex items-center justify-between text-[#344054]">
        <span>Subtotal</span>
        <span>{formatCurrency(subtotal)}</span>
      </div>
      <div className="flex items-center justify-between text-[#344054]">
        <span>Despacho</span>
        <span>{costoDespacho > 0 ? formatCurrency(costoDespacho) : "Por pagar"}</span>
      </div>
      <div className="flex items-center justify-between border-t border-[#e4e7ec] pt-3 text-base font-bold text-[#111318]">
        <span>Total estimado</span>
        <span>{formatCurrency(total)}</span>
      </div>
    </div>
  );
}

type DespachoOptionProps = {
  icon: React.ReactNode;
  label: string;
  helper: string;
  active: boolean;
  highlighted?: boolean;
  onSelect: () => void;
};

function DespachoOption({ icon, label, helper, active, highlighted, onSelect }: DespachoOptionProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      role="radio"
      aria-checked={active}
      className={`flex min-h-[120px] flex-col gap-2 rounded-[14px] border p-4 text-left transition ${
        active
          ? "border-[#7357ff] bg-[#f5f3ff] ring-2 ring-[#7357ff]"
          : highlighted
            ? "border-[#7357ff] ring-4 ring-[#eeebff]"
            : "border-[#d0d5dd] bg-white hover:border-[#7357ff]"
      }`}
    >
      <span className="flex items-center gap-2 text-sm font-semibold text-[#111318]">
        <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${active ? "border-[#7357ff]" : "border-[#98a2b3]"}`}>
          {active ? <span className="h-2.5 w-2.5 rounded-full bg-[#7357ff]" /> : null}
        </span>
        {icon}
        {label}
      </span>
      <span className="pl-7 text-xs leading-5 text-[#667085]">{helper}</span>
    </button>
  );
}

type SelectFieldProps = {
  id: string;
  label: string;
  value: string;
  options: string[];
  error?: string;
  placeholder: string;
  autoComplete?: string;
  disabled?: boolean;
  highlighted?: boolean;
  selectRef?: React.RefObject<HTMLSelectElement | null>;
  onChange: (value: string) => void;
};

function SelectField({
  id,
  label,
  value,
  options,
  error,
  placeholder,
  autoComplete,
  disabled = false,
  highlighted = false,
  selectRef,
  onChange
}: SelectFieldProps) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-[#111318]">{label}</span>
      <select
        id={id}
        ref={selectRef}
        value={value}
        disabled={disabled}
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={`app-input block w-full px-4 text-base outline-none disabled:cursor-not-allowed disabled:bg-[#f2f4f7] disabled:text-[#98a2b3] ${
          highlighted ? "border-[#7357ff] ring-4 ring-[#eeebff]" : ""
        }`}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {error ? (
        <span id={`${id}-error`} className="text-sm text-danger">
          {error}
        </span>
      ) : null}
    </label>
  );
}

type TextFieldProps = {
  id: string;
  label: string;
  value: string;
  error?: string;
  placeholder?: string;
  autoComplete?: string;
  type?: string;
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
  type = "text",
  icon,
  highlighted = false,
  inputRef,
  onChange
}: TextFieldProps) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-[#111318]">{label}</span>
      <div
        className={`app-input flex items-center gap-3 px-4 transition ${
          highlighted ? "border-[#7357ff] ring-4 ring-[#eeebff]" : ""
        }`}
      >
        {icon ? <span className="text-[#667085]">{icon}</span> : null}
        <input
          id={id}
          ref={inputRef}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="w-full border-0 bg-transparent p-0 text-base text-[#111318] outline-none placeholder:text-[#98a2b3]"
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
      <span className="text-sm font-medium text-[#111318]">{label}</span>
      <div
        className={`app-input flex items-center gap-3 px-4 transition ${
          highlighted ? "border-[#7357ff] ring-4 ring-[#eeebff]" : ""
        }`}
      >
        <Phone className="h-4 w-4 text-[#667085]" />
        <span className="text-sm font-semibold text-[#5434e6]">+56</span>
        <input
          id={id}
          ref={inputRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="9 1234 5678"
          autoComplete="tel"
          inputMode="tel"
          className="w-full border-0 bg-transparent p-0 text-base text-[#111318] outline-none placeholder:text-[#98a2b3]"
        />
      </div>
      {error ? <span className="text-sm text-danger">{error}</span> : null}
    </label>
  );
}
