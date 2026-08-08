"use client";

import { useCallback, useEffect, useState } from "react";
import { MailPlus, RefreshCcw, ShieldCheck, UserCheck, UserX, X } from "lucide-react";
import type { AdminUserListItem, AdminUserRole } from "@/lib/admin-users";

const STATUS_LABELS = {
  PENDING_INVITATION: "Pendiente de invitación",
  ACTIVE: "Activo",
  INACTIVE: "Inactivo"
} as const;

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
  const [role, setRole] = useState<AdminUserRole>("ADMIN");
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
        body: JSON.stringify({ name, email, role })
      });
      if (!response.ok) throw new Error(await readError(response));
      setName("");
      setEmail("");
      setRole("ADMIN");
      setInviteOpen(false);
      setSuccess("Invitación enviada correctamente.");
      await loadUsers();
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : "No fue posible enviar la invitación.");
    } finally {
      setBusyId("");
    }
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
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${user.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : user.status === "INACTIVE" ? "bg-stone-100 text-stone-600" : "bg-amber-50 text-amber-800"}`}>
                  {STATUS_LABELS[user.status]}
                </span>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-xs text-[#8C8175]">Rol</dt><dd className="mt-0.5 font-semibold text-[#191714]">{user.role}</dd></div>
                <div><dt className="text-xs text-[#8C8175]">Creado</dt><dd className="mt-0.5 text-[#4D453D]">{formatDate(user.createdAt)}</dd></div>
                <div><dt className="text-xs text-[#8C8175]">Invitación</dt><dd className="mt-0.5 text-[#4D453D]">{formatDate(user.invitedAt)}</dd></div>
                <div><dt className="text-xs text-[#8C8175]">Último acceso</dt><dd className="mt-0.5 text-[#4D453D]">{formatDate(user.lastSignInAt)}</dd></div>
              </dl>

              <div className="mt-4 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
                {user.status === "PENDING_INVITATION" ? (
                  <button type="button" disabled={busyId === user.id} onClick={() => void mutate(user.id, { action: "resend" }, "Invitación reenviada.")} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#D8BEA2] bg-[#F7F1E8] px-3 text-sm font-semibold text-[#6F472C] disabled:opacity-50">
                    <RefreshCcw className="h-4 w-4" /> Reenviar
                  </button>
                ) : null}
                <button type="button" disabled={busyId === user.id} onClick={() => void mutate(user.id, { action: "set-active", active: !user.active }, user.active ? "Usuario desactivado." : "Usuario activado.")} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#DDD0C1] px-3 text-sm font-semibold text-[#4D453D] disabled:opacity-50">
                  {user.active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />} {user.active ? "Desactivar" : "Activar"}
                </button>
                <button type="button" disabled={busyId === user.id} onClick={() => void mutate(user.id, { action: "set-role", role: user.role === "OWNER" ? "ADMIN" : "OWNER" }, `Rol actualizado a ${user.role === "OWNER" ? "ADMIN" : "OWNER"}.`)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#DDD0C1] px-3 text-sm font-semibold text-[#4D453D] disabled:opacity-50">
                  <ShieldCheck className="h-4 w-4" /> Hacer {user.role === "OWNER" ? "ADMIN" : "OWNER"}
                </button>
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
              <label className="block"><span className="mb-1.5 block text-sm font-semibold text-[#191714]">Rol</span><select value={role} onChange={(event) => setRole(event.target.value as AdminUserRole)} className="app-input w-full px-4"><option value="ADMIN">ADMIN</option><option value="OWNER">OWNER</option></select></label>
            </div>
            <button type="submit" disabled={busyId === "invite"} className="app-button-primary mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 px-4 font-semibold disabled:opacity-50"><MailPlus className="h-4 w-4" /> {busyId === "invite" ? "Enviando…" : "Enviar invitación"}</button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
