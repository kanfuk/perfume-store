"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bell,
  CheckCircle2,
  ChevronLeft,
  Contact,
  CreditCard,
  LockKeyhole,
  LogOut,
  Save,
  ShieldCheck,
  Truck
} from "lucide-react";
import { AdminPushSettingsPanel } from "@/components/admin/AdminPushSettingsPanel";
import {
  CHILEAN_ACCOUNT_TYPES,
  OTRA_CUENTA_VALUE
} from "@/config/chileanAccountTypes";
import { CHILEAN_BANKS, OTRO_BANCO_VALUE } from "@/config/chileanBanks";
import { useAppFeedback } from "@/hooks/useAppFeedback";
import {
  businessPaymentSettingsToFormInput,
  maskAccountNumber,
  resolveAccountTypeDisplayName,
  resolveBankDisplayName,
  validateBusinessPaymentSettings,
  type BusinessPaymentSettings,
  type BusinessPaymentSettingsFieldErrors,
  type BusinessPaymentSettingsFormInput
} from "@/lib/businessPaymentSettings";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type SettingsSection =
  | "transferencia"
  | "contacto"
  | "despacho"
  | "notificaciones-push"
  | "seguridad";

const EMPTY_FORM: BusinessPaymentSettingsFormInput = {
  banco: "",
  bancoOtro: "",
  tipoCuenta: "",
  tipoCuentaOtro: "",
  titularCuenta: "",
  rutTitular: "",
  numeroCuenta: "",
  correo: ""
};

const SECTIONS: Array<{
  key: SettingsSection;
  label: string;
  icon: typeof CreditCard;
}> = [
  { key: "transferencia", label: "Datos de transferencia", icon: CreditCard },
  { key: "contacto", label: "Datos de contacto", icon: Contact },
  { key: "despacho", label: "Despacho", icon: Truck },
  { key: "notificaciones-push", label: "Notificaciones push", icon: Bell },
  { key: "seguridad", label: "Seguridad", icon: ShieldCheck }
];

export function BusinessSettingsPanel({
  initialSection = "transferencia",
  pendingCount = 0
}: {
  initialSection?: SettingsSection;
  pendingCount?: number;
}) {
  const feedback = useAppFeedback();
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [form, setForm] = useState<BusinessPaymentSettingsFormInput>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] =
    useState<BusinessPaymentSettingsFieldErrors>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [complete, setComplete] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      try {
        setLoading(true);
        setLoadError("");
        const response = await fetch("/api/admin/settings/payment", {
          cache: "no-store"
        });
        const payload = (await response.json()) as {
          settings?: BusinessPaymentSettings;
          completa?: boolean;
          error?: string;
        };

        if (!response.ok || !payload.settings) {
          throw new Error(payload.error ?? "No fue posible cargar la configuracion.");
        }

        if (!cancelled) {
          setForm(businessPaymentSettingsToFormInput(payload.settings));
          setComplete(payload.completa === true);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "No fue posible cargar la configuracion."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  const preview = useMemo(() => {
    const validation = validateBusinessPaymentSettings(form);

    if (!validation.valid) {
      return "Completa y valida los datos para ver el mensaje de transferencia.";
    }

    return [
      "Datos para la transferencia:",
      `Titular: ${validation.data.titularCuenta}`,
      `RUT: ${validation.data.rutTitular}`,
      `Banco: ${resolveBankDisplayName(validation.data.banco)}`,
      `Tipo de cuenta: ${resolveAccountTypeDisplayName(validation.data.tipoCuenta)}`,
      `N° de cuenta: ${maskAccountNumber(validation.data.numeroCuenta)}`,
      `Correo: ${validation.data.correo}`,
      "Moneda: Pesos chilenos (CLP)"
    ].join("\n");
  }, [form]);

  function updateField<Key extends keyof BusinessPaymentSettingsFormInput>(
    key: Key,
    value: BusinessPaymentSettingsFormInput[Key]
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
  }

  async function savePaymentSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (saving) {
      return;
    }

    const clientValidation = validateBusinessPaymentSettings(form);

    if (!clientValidation.valid) {
      setFieldErrors(clientValidation.errors);
      setComplete(false);
      feedback.error("Revisa los campos marcados antes de guardar.");
      return;
    }

    try {
      setSaving(true);
      setFieldErrors({});
      const response = await fetch("/api/admin/settings/payment", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const payload = (await response.json()) as {
        settings?: BusinessPaymentSettings;
        completa?: boolean;
        errors?: BusinessPaymentSettingsFieldErrors;
        error?: string;
      };

      if (!response.ok) {
        if (payload.errors) {
          setFieldErrors(payload.errors);
        }
        throw new Error(payload.error ?? "No fue posible guardar la configuracion.");
      }

      if (payload.settings) {
        setForm(businessPaymentSettingsToFormInput(payload.settings));
      }
      setComplete(payload.completa === true);
      feedback.success("Datos de transferencia guardados y validados.");
    } catch (error) {
      feedback.error(
        error instanceof Error
          ? error.message
          : "No fue posible guardar la configuracion."
      );
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    await createSupabaseBrowserClient().auth.signOut();
    window.location.assign("/admin/login");
  }

  return (
    <main className="min-h-screen bg-[#F7F1E8] px-4 py-6 text-[#171613] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-[26px] bg-[#171613] p-5 text-white shadow-soft sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Link
                href="/admin"
                className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-white/15 px-4 py-2 text-sm font-semibold text-white/85"
              >
                <ChevronLeft className="h-4 w-4" />
                Centro de control
              </Link>
              <h1 className="mt-5 text-2xl font-bold sm:text-3xl">
                Configuración del negocio
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">
                Administra datos operativos privados. La información bancaria sólo se
                entrega al servidor y nunca se publica en el catálogo.
              </p>
            </div>
            <span
              className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${
                complete
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-amber-100 text-amber-900"
              }`}
            >
              {complete ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <LockKeyhole className="h-4 w-4" />
              )}
              {complete ? "Configuración completa" : "Faltan datos"}
            </span>
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
          <nav
            aria-label="Secciones de configuración"
            className="h-fit rounded-[24px] border border-[#DDD0C1] bg-white p-3 shadow-soft"
          >
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              {SECTIONS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSection(key)}
                  className={`inline-flex min-h-12 items-center gap-3 rounded-[18px] px-4 py-3 text-left text-sm font-semibold transition ${
                    section === key
                      ? "bg-[#171613] text-white"
                      : "bg-[#F7F1E8] text-[#4D453D] hover:bg-[#eef0f4]"
                  }`}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {label}
                </button>
              ))}
            </div>
          </nav>

          {section === "transferencia" ? (
            <PaymentSettingsForm
              complete={complete}
              fieldErrors={fieldErrors}
              form={form}
              loadError={loadError}
              loading={loading}
              preview={preview}
              saving={saving}
              onChange={updateField}
              onSubmit={savePaymentSettings}
            />
          ) : section === "notificaciones-push" ? (
            <AdminPushSettingsPanel pendingCount={pendingCount} />
          ) : section === "seguridad" ? (
            <section className="rounded-[24px] border border-[#DDD0C1] bg-white p-5 shadow-soft sm:p-7">
              <h2 className="text-xl font-bold">Seguridad</h2>
              <p className="mt-2 text-sm leading-6 text-[#6B6258]">
                Cambia tu contraseña o cierra la sesión administrativa de este dispositivo.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/admin/mantenimiento"
                  className="inline-flex min-h-11 items-center gap-2 rounded-[18px] bg-rose-700 px-4 py-3 text-sm font-semibold text-white"
                >
                  <ShieldCheck className="h-4 w-4" />
                  Mantenimiento seguro
                </Link>
                <Link
                  href="/admin/set-password"
                  className="inline-flex min-h-11 items-center gap-2 rounded-[18px] bg-[#171613] px-4 py-3 text-sm font-semibold text-white"
                >
                  <LockKeyhole className="h-4 w-4" />
                  Cambiar contraseña
                </Link>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="inline-flex min-h-11 items-center gap-2 rounded-[18px] border border-[#d0d5dd] px-4 py-3 text-sm font-semibold text-[#4D453D]"
                >
                  <LogOut className="h-4 w-4" />
                  Cerrar sesión
                </button>
              </div>
            </section>
          ) : (
            <section className="rounded-[24px] border border-[#DDD0C1] bg-white p-5 shadow-soft sm:p-7">
              <h2 className="text-xl font-bold">
                {SECTIONS.find((item) => item.key === section)?.label}
              </h2>
              <p className="mt-2 text-sm leading-6 text-[#6B6258]">
                Esta sección queda visible para la navegación del negocio. Su configuración
                se implementará en una fase posterior.
              </p>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}

type PaymentSettingsFormProps = {
  complete: boolean;
  fieldErrors: BusinessPaymentSettingsFieldErrors;
  form: BusinessPaymentSettingsFormInput;
  loadError: string;
  loading: boolean;
  preview: string;
  saving: boolean;
  onChange: <Key extends keyof BusinessPaymentSettingsFormInput>(
    key: Key,
    value: BusinessPaymentSettingsFormInput[Key]
  ) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
};

function PaymentSettingsForm({
  complete,
  fieldErrors,
  form,
  loadError,
  loading,
  preview,
  saving,
  onChange,
  onSubmit
}: PaymentSettingsFormProps) {
  if (loading) {
    return (
      <section className="rounded-[24px] border border-[#DDD0C1] bg-white p-7 shadow-soft">
        Cargando configuración…
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="rounded-[24px] border border-rose-200 bg-rose-50 p-7 text-rose-900">
        {loadError}
      </section>
    );
  }

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      className="rounded-[24px] border border-[#DDD0C1] bg-white p-5 shadow-soft sm:p-7"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Datos de transferencia</h2>
          <p className="mt-2 text-sm leading-6 text-[#6B6258]">
            Se usarán al atender un pedido y solicitar el pago por WhatsApp.
          </p>
        </div>
        <span className="rounded-full bg-[#EEE5DA] px-3 py-2 text-xs font-semibold text-[#475467]">
          {complete ? "Validada" : "Pendiente"}
        </span>
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <FormSelect
          error={fieldErrors.banco}
          label="Banco"
          value={form.banco}
          onChange={(value) => onChange("banco", value)}
          options={CHILEAN_BANKS}
        />
        {form.banco === OTRO_BANCO_VALUE ? (
          <FormInput
            error={fieldErrors.bancoOtro}
            label="Nombre del banco o institución"
            value={form.bancoOtro ?? ""}
            onChange={(value) => onChange("bancoOtro", value)}
          />
        ) : null}

        <FormSelect
          error={fieldErrors.tipoCuenta}
          label="Tipo de cuenta"
          value={form.tipoCuenta}
          onChange={(value) => onChange("tipoCuenta", value)}
          options={CHILEAN_ACCOUNT_TYPES}
        />
        {form.tipoCuenta === OTRA_CUENTA_VALUE ? (
          <FormInput
            error={fieldErrors.tipoCuentaOtro}
            label="Tipo de cuenta manual"
            value={form.tipoCuentaOtro ?? ""}
            onChange={(value) => onChange("tipoCuentaOtro", value)}
          />
        ) : null}

        <FormInput
          error={fieldErrors.titularCuenta}
          label="Titular"
          value={form.titularCuenta}
          onChange={(value) => onChange("titularCuenta", value)}
        />
        <FormInput
          error={fieldErrors.rutTitular}
          label="RUT"
          value={form.rutTitular}
          onChange={(value) => onChange("rutTitular", value)}
          placeholder="12.345.678-5"
        />
        <FormInput
          error={fieldErrors.numeroCuenta}
          label="Número de cuenta"
          value={form.numeroCuenta}
          onChange={(value) => onChange("numeroCuenta", value)}
          inputMode="numeric"
          autoComplete="off"
        />
        <FormInput
          error={fieldErrors.correo}
          label="Correo"
          value={form.correo}
          onChange={(value) => onChange("correo", value)}
          type="email"
          autoComplete="email"
        />
        <FormInput
          label="Moneda"
          value="Pesos chilenos (CLP)"
          onChange={() => undefined}
          readOnly
        />
      </div>

      <div className="mt-6 rounded-[20px] border border-[#DDD0C1] bg-[#f8fafc] p-4">
        <h3 className="text-sm font-bold text-[#4D453D]">Vista previa del mensaje</h3>
        <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-sm leading-6 text-[#475467]">
          {preview}
        </pre>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[18px] bg-[#171613] px-5 py-3 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        <Save className="h-5 w-5" />
        {saving ? "Guardando…" : "Guardar y validar"}
      </button>
    </form>
  );
}

function FormInput({
  label,
  value,
  onChange,
  error,
  readOnly,
  type = "text",
  ...props
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  readOnly?: boolean;
  type?: React.HTMLInputTypeAttribute;
} & Pick<
  React.InputHTMLAttributes<HTMLInputElement>,
  "autoComplete" | "inputMode" | "placeholder"
>) {
  return (
    <label className="space-y-2">
      <span className="block text-sm font-semibold text-[#4D453D]">{label}</span>
      <input
        {...props}
        type={type}
        readOnly={readOnly}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        className="min-h-12 w-full rounded-[16px] border border-[#d0d5dd] bg-white px-4 py-3 text-base text-[#171613] outline-none focus:border-[#B88B58] read-only:bg-[#EEE5DA]"
      />
      {error ? <span className="block text-sm text-rose-700">{error}</span> : null}
    </label>
  );
}

function FormSelect({
  label,
  value,
  onChange,
  options,
  error
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  error?: string;
}) {
  return (
    <label className="space-y-2">
      <span className="block text-sm font-semibold text-[#4D453D]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        className="min-h-12 w-full rounded-[16px] border border-[#d0d5dd] bg-white px-4 py-3 text-base text-[#171613] outline-none focus:border-[#B88B58]"
      >
        <option value="">Selecciona una opción</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? <span className="block text-sm text-rose-700">{error}</span> : null}
    </label>
  );
}
