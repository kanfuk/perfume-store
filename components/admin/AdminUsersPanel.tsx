"use client";

import { useCallback, useEffect, useState } from "react";
import { CreditCard, MailPlus, RefreshCcw, Save, UserCheck, UserX, X } from "lucide-react";
import { CHILEAN_ACCOUNT_TYPES, OTRA_CUENTA_VALUE } from "@/config/chileanAccountTypes";
import { CHILEAN_BANKS, OTRO_BANCO_VALUE } from "@/config/chileanBanks";
import type { AdminPaymentAccountFormInput } from "@/lib/admin-payment-accounts";
import type { AdminUserListItem } from "@/lib/admin-users";
import {
  validateBusinessPaymentSettings,
  type BusinessPaymentSettingsFieldErrors
} from "@/lib/businessPaymentSettings";

const STATUS_LABELS = {
  PENDING_INVITATION: "Pendiente de invitación",
  ACTIVE: "Activo",
  INACTIVE: "Inactivo"
} as const;

const PAYMENT_STATUS_LABELS = {
  CONFIGURED: "Cuenta configurada",
  PENDING: "Cuenta pendiente",
  INACTIVE: "Cuenta inactiva"
} as const;

const EMPTY_ACCOUNT: AdminPaymentAccountFormInput = {
  banco: "",
  bancoOtro: "",
  tipoCuenta: "",
  tipoCuentaOtro: "",
  titularCuenta: "",
  rutTitular: "",
  numeroCuenta: "",
  correo: "",
  active: true
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

async function readError(response: Response) {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return payload?.error || "No fue posible completar la operación.";
}

export function AdminUsersPanel() {
  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [accountUser, setAccountUser] = useState<AdminUserListItem | null>(null);
  const [accountForm, setAccountForm] = useState<AdminPaymentAccountFormInput>(EMPTY_ACCOUNT);
  const [accountErrors, setAccountErrors] = useState<BusinessPaymentSettingsFieldErrors>({});
  const [accountLoading, setAccountLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadUsers = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      if (!response.ok) throw new Error(await readError(response));
      const payload = (await response.json()) as { users: AdminUserListItem[] };
      setUsers(payload.users);
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : "No fue posible cargar usuarios.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadUsers(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadUsers]);

  async function mutate(userId: string, body: Record<string, unknown>, successMessage: string) {
    setBusyId(userId);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!response.ok) throw new Error(await readError(response));
      setSuccess(successMessage);
      await loadUsers();
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : "No fue posible actualizar el usuario.");
    } finally {
      setBusyId("");
    }
  }

  async function invite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyId("invite");
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email })
      });
      if (!response.ok) throw new Error(await readError(response));
      setName("");
      setEmail("");
      setInviteOpen(false);
      setSuccess("Invitación enviada correctamente.");
      await loadUsers();
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : "No fue posible enviar la invitación.");
    } finally {
      setBusyId("");
    }
  }

  async function openAccount(user: AdminUserListItem) {
    setAccountUser(user);
    setAccountForm(EMPTY_ACCOUNT);
    setAccountErrors({});
    setAccountLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/users/${user.id}/payment-account`, {
        cache: "no-store"
      });
      const payload = (await response.json()) as {
        account?: AdminPaymentAccountFormInput | null;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "No fue posible cargar la cuenta.");
      setAccountForm(payload.account ?? EMPTY_ACCOUNT);
    } catch (currentError) {
      setAccountUser(null);
      setError(currentError instanceof Error ? currentError.message : "No fue posible cargar la cuenta.");
    } finally {
      setAccountLoading(false);
    }
  }

  async function saveAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accountUser) return;
    const validation = validateBusinessPaymentSettings(accountForm);
    if (!validation.valid) {
      setAccountErrors(validation.errors);
      return;
    }

    setBusyId(`account:${accountUser.id}`);
    setAccountErrors({});
    setError("");
    try {
      const response = await fetch(`/api/admin/users/${accountUser.id}/payment-account`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(accountForm)
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        errors?: BusinessPaymentSettingsFieldErrors;
      } | null;
      if (!response.ok) {
        if (payload?.errors) setAccountErrors(payload.errors);
        throw new Error(payload?.error || "No fue posible guardar la cuenta.");
      }
      setAccountUser(null);
      setSuccess("Cuenta de cobro guardada correctamente.");
      await loadUsers();
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : "No fue posible guardar la cuenta.");
    } finally {
      setBusyId("");
    }
  }

  function updateAccountField<Key extends keyof AdminPaymentAccountFormInput>(
    key: Key,
    value: AdminPaymentAccountFormInput[Key]
  ) {
    setAccountForm((current) => ({ ...current, [key]: value }));
    setAccountErrors((current) => ({ ...current, [key]: undefined }));
  }

  return (
    <section className="space-y-5" aria-labelledby="admin-users-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8A6036]">Acceso seguro</p>
          <h1 id="admin-users-title" className="mt-1 text-2xl font-bold text-[#191714] sm:text-3xl">Usuarios administrativos</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6B6258]">
            Solo un OWNER puede invitar y administrar accesos. Las contraseñas las define cada invitado.
          </p>
        </div>
        <button type="button" onClick={() => setInviteOpen(true)} className="app-button-primary inline-flex min-h-11 items-center justify-center gap-2 px-4 font-semibold">
          <MailPlus className="h-4 w-4" /> Invitar usuario
        </button>
      </div>

      {error ? <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div> : null}
      {success ? <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</div> : null}

      {loading ? (
        <div className="rounded-2xl border border-[#DDD0C1] bg-white p-6 text-center text-sm text-[#6B6258]">Cargando usuarios…</div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {users.map((user) => (
            <article key={user.id} className="min-w-0 rounded-2xl border border-[#DDD0C1] bg-white p-4 shadow-[0_10px_28px_rgba(25,23,20,0.06)] sm:p-5">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate font-bold text-[#191714]">{user.name}</h2>
                  <p className="break-all text-sm text-[#6B6258]">{user.email}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  {user.isPrimaryOwner ? (
                    <span className="rounded-full bg-[#171613] px-2.5 py-1 text-xs font-bold text-white">
                      OWNER · Cuenta principal
                    </span>
                  ) : null}
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${user.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : user.status === "INACTIVE" ? "bg-stone-100 text-stone-600" : "bg-amber-50 text-amber-800"}`}>
                    {STATUS_LABELS[user.status]}
                  </span>
                </div>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-xs text-[#8C8175]">Rol</dt><dd className="mt-0.5 font-semibold text-[#191714]">{user.role}</dd></div>
                <div><dt className="text-xs text-[#8C8175]">Creado</dt><dd className="mt-0.5 text-[#4D453D]">{formatDate(user.createdAt)}</dd></div>
                <div><dt className="text-xs text-[#8C8175]">Invitación</dt><dd className="mt-0.5 text-[#4D453D]">{formatDate(user.invitedAt)}</dd></div>
                <div><dt className="text-xs text-[#8C8175]">Último acceso</dt><dd className="mt-0.5 text-[#4D453D]">{formatDate(user.lastSignInAt)}</dd></div>
              </dl>

              {user.role === "ADMIN" && user.paymentAccountStatus ? (
                <div className="mt-4 rounded-xl border border-[#E6D9CA] bg-[#F7F1E8] px-3 py-2.5 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-[#4D453D]">
                      {PAYMENT_STATUS_LABELS[user.paymentAccountStatus]}
                    </span>
                    {user.maskedAccountNumber ? (
                      <span className="font-mono text-[#6B6258]">{user.maskedAccountNumber}</span>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="mt-4 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
                {user.status === "PENDING_INVITATION" ? (
                  <button type="button" disabled={busyId === user.id} onClick={() => void mutate(user.id, { action: "resend" }, "Invitación reenviada.")} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#D8BEA2] bg-[#F7F1E8] px-3 text-sm font-semibold text-[#6F472C] disabled:opacity-50">
                    <RefreshCcw className="h-4 w-4" /> Reenviar
                  </button>
                ) : null}
                {user.role === "ADMIN" ? (
                  <button type="button" disabled={busyId === `account:${user.id}`} onClick={() => void openAccount(user)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#D8BEA2] bg-[#F7F1E8] px-3 text-sm font-semibold text-[#6F472C] disabled:opacity-50">
                    <CreditCard className="h-4 w-4" /> {user.paymentAccountStatus === "PENDING" ? "Configurar cuenta" : "Editar cuenta"}
                  </button>
                ) : null}
                {user.role === "ADMIN" ? (
                  <button type="button" disabled={busyId === user.id} onClick={() => void mutate(user.id, { action: "set-active", active: !user.active }, user.active ? "Usuario desactivado." : "Usuario activado.")} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#DDD0C1] px-3 text-sm font-semibold text-[#4D453D] disabled:opacity-50">
                    {user.active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />} {user.active ? "Desactivar" : "Activar"}
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}

      {inviteOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0B0B0B]/70 p-0 sm:items-center sm:p-5" role="presentation" onMouseDown={() => setInviteOpen(false)}>
          <form onSubmit={invite} role="dialog" aria-modal="true" aria-labelledby="invite-user-title" className="max-h-[100dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] border border-[#DDD0C1] bg-[#FFFCF7] p-5 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-[28px] sm:p-6" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
              <h2 id="invite-user-title" className="text-xl font-bold text-[#191714]">Invitar usuario</h2>
              <button type="button" aria-label="Cerrar" onClick={() => setInviteOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-full border border-[#DDD0C1]"><X className="h-4 w-4" /></button>
            </div>
            <p className="mt-2 text-sm leading-6 text-[#6B6258]">Supabase enviará el enlace. El invitado definirá su propia contraseña.</p>
            <div className="mt-5 space-y-4">
              <label className="block"><span className="mb-1.5 block text-sm font-semibold text-[#191714]">Nombre</span><input required minLength={2} maxLength={100} value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" className="app-input w-full px-4" /></label>
              <label className="block"><span className="mb-1.5 block text-sm font-semibold text-[#191714]">Correo</span><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" className="app-input w-full px-4" /></label>
              <div className="rounded-xl border border-[#DDD0C1] bg-white px-4 py-3 text-sm text-[#4D453D]">
                Rol de invitación: <strong>ADMIN</strong>
              </div>
            </div>
            <button type="submit" disabled={busyId === "invite"} className="app-button-primary mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 px-4 font-semibold disabled:opacity-50"><MailPlus className="h-4 w-4" /> {busyId === "invite" ? "Enviando…" : "Enviar invitación"}</button>
          </form>
        </div>
      ) : null}

      {accountUser ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0B0B0B]/70 p-0 sm:items-center sm:p-5" role="presentation" onMouseDown={() => setAccountUser(null)}>
          <form onSubmit={saveAccount} noValidate role="dialog" aria-modal="true" aria-labelledby="payment-account-title" className="max-h-[100dvh] w-full max-w-2xl overflow-y-auto rounded-t-[28px] border border-[#DDD0C1] bg-[#FFFCF7] p-5 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-[28px] sm:p-6" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 id="payment-account-title" className="text-xl font-bold text-[#191714]">Cuenta de cobro</h2>
                <p className="mt-1 text-sm text-[#6B6258]">{accountUser.name} · {accountUser.email}</p>
              </div>
              <button type="button" aria-label="Cerrar" onClick={() => setAccountUser(null)} className="flex h-11 w-11 items-center justify-center rounded-full border border-[#DDD0C1]"><X className="h-4 w-4" /></button>
            </div>

            {accountLoading ? (
              <p className="mt-6 text-sm text-[#6B6258]">Cargando cuenta…</p>
            ) : (
              <>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <AccountSelect label="Banco" value={accountForm.banco} options={CHILEAN_BANKS} error={accountErrors.banco} onChange={(value) => updateAccountField("banco", value)} />
                  {accountForm.banco === OTRO_BANCO_VALUE ? <AccountInput label="Nombre del banco" value={accountForm.bancoOtro ?? ""} error={accountErrors.bancoOtro} onChange={(value) => updateAccountField("bancoOtro", value)} /> : null}
                  <AccountSelect label="Tipo de cuenta" value={accountForm.tipoCuenta} options={CHILEAN_ACCOUNT_TYPES} error={accountErrors.tipoCuenta} onChange={(value) => updateAccountField("tipoCuenta", value)} />
                  {accountForm.tipoCuenta === OTRA_CUENTA_VALUE ? <AccountInput label="Tipo de cuenta manual" value={accountForm.tipoCuentaOtro ?? ""} error={accountErrors.tipoCuentaOtro} onChange={(value) => updateAccountField("tipoCuentaOtro", value)} /> : null}
                  <AccountInput label="Titular" value={accountForm.titularCuenta} error={accountErrors.titularCuenta} onChange={(value) => updateAccountField("titularCuenta", value)} />
                  <AccountInput label="RUT" value={accountForm.rutTitular} error={accountErrors.rutTitular} placeholder="12.345.678-5" onChange={(value) => updateAccountField("rutTitular", value)} />
                  <AccountInput label="Número de cuenta" value={accountForm.numeroCuenta} error={accountErrors.numeroCuenta} inputMode="numeric" autoComplete="off" onChange={(value) => updateAccountField("numeroCuenta", value)} />
                  <AccountInput label="Correo" value={accountForm.correo} error={accountErrors.correo} type="email" autoComplete="email" onChange={(value) => updateAccountField("correo", value)} />
                </div>
                <label className="mt-5 flex items-center gap-3 rounded-xl border border-[#DDD0C1] bg-white px-4 py-3 text-sm font-semibold text-[#4D453D]">
                  <input type="checkbox" checked={accountForm.active} onChange={(event) => updateAccountField("active", event.target.checked)} className="h-5 w-5" />
                  Cuenta activa para recibir cobros
                </label>
                <button type="submit" disabled={busyId === `account:${accountUser.id}`} className="app-button-primary mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 px-4 font-semibold disabled:opacity-50 sm:w-auto"><Save className="h-4 w-4" /> {busyId === `account:${accountUser.id}` ? "Guardando…" : "Guardar cuenta"}</button>
              </>
            )}
          </form>
        </div>
      ) : null}
    </section>
  );
}

function AccountInput({ label, value, onChange, error, type = "text", ...props }: { label: string; value: string; onChange: (value: string) => void; error?: string; type?: React.HTMLInputTypeAttribute } & Pick<React.InputHTMLAttributes<HTMLInputElement>, "autoComplete" | "inputMode" | "placeholder">) {
  return <label className="block"><span className="mb-1.5 block text-sm font-semibold text-[#191714]">{label}</span><input {...props} type={type} value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} className="app-input w-full px-4" />{error ? <span className="mt-1 block text-sm text-rose-700">{error}</span> : null}</label>;
}

function AccountSelect({ label, value, onChange, options, error }: { label: string; value: string; onChange: (value: string) => void; options: ReadonlyArray<{ value: string; label: string }>; error?: string }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-semibold text-[#191714]">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} className="app-input w-full px-4"><option value="">Seleccionar</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>{error ? <span className="mt-1 block text-sm text-rose-700">{error}</span> : null}</label>;
}
