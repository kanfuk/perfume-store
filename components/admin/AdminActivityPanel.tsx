"use client";

import { useEffect, useState } from "react";

type AuditItem = {
  id: string; created_at: string; actor_role: string; action: string;
  entity_type: string; entity_id: string | null; request_id: string;
  usuarios_admin: { nombre: string | null; email: string } | null;
};

type AuditActor = { id: string; nombre: string | null; email: string };

export function AdminActivityPanel() {
  const [items, setItems] = useState<AuditItem[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [actors, setActors] = useState<AuditActor[]>([]);
  const [filters, setFilters] = useState({ actor: "", action: "", entity: "", from: "", to: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
    fetch(`/api/admin/activity?${query}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { items?: AuditItem[]; actions?: string[]; actors?: AuditActor[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "No fue posible cargar la actividad.");
        if (active) { setItems(payload.items ?? []); setActions(payload.actions ?? []); setActors(payload.actors ?? []); setError(""); }
      })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Error inesperado."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filters]);

  return <section className="space-y-4">
    <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8A6036]">OWNER</p><h1 className="text-2xl font-bold text-[#191714]">Actividad</h1><p className="text-sm text-[#6B6258]">Bitácora inmutable de acciones administrativas.</p></div>
    <div className="grid gap-3 rounded-2xl border border-[#DDD0C1] bg-white p-4 sm:grid-cols-2 lg:grid-cols-5">
      <label className="text-xs font-semibold">Administrador<select aria-label="Filtrar por administrador" value={filters.actor} onChange={(e) => setFilters((f) => ({...f, actor: e.target.value}))} className="mt-1 min-h-11 w-full rounded-xl border px-3"><option value="">Todos</option>{actors.map((actor) => <option key={actor.id} value={actor.id}>{actor.nombre ?? actor.email}</option>)}</select></label>
      <label className="text-xs font-semibold">Acción<select aria-label="Filtrar por acción" value={filters.action} onChange={(e) => setFilters((f) => ({...f, action: e.target.value}))} className="mt-1 min-h-11 w-full rounded-xl border px-3"><option value="">Todas</option>{actions.map((a) => <option key={a}>{a}</option>)}</select></label>
      <label className="text-xs font-semibold">Entidad<input value={filters.entity} onChange={(e) => setFilters((f) => ({...f, entity: e.target.value}))} placeholder="producto, pedido…" className="mt-1 min-h-11 w-full rounded-xl border px-3" /></label>
      <label className="text-xs font-semibold">Desde<input type="date" value={filters.from} onChange={(e) => setFilters((f) => ({...f, from: e.target.value}))} className="mt-1 min-h-11 w-full rounded-xl border px-3" /></label>
      <label className="text-xs font-semibold">Hasta<input type="date" value={filters.to} onChange={(e) => setFilters((f) => ({...f, to: e.target.value}))} className="mt-1 min-h-11 w-full rounded-xl border px-3" /></label>
    </div>
    {error ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
    <div className="space-y-2">{loading ? <p>Cargando actividad…</p> : items.length === 0 ? <p className="rounded-xl border bg-white p-5 text-sm">No hay actividad para estos filtros.</p> : items.map((item) => <article key={item.id} className="rounded-2xl border border-[#DDD0C1] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm text-[#191714]">{item.action}</strong><time className="text-xs text-[#6B6258]">{new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santiago" }).format(new Date(item.created_at))}</time></div>
      <p className="mt-1 text-sm text-[#4D453D]">{item.usuarios_admin?.nombre ?? item.usuarios_admin?.email ?? item.actor_role} · {item.entity_type}{item.entity_id ? ` · ${item.entity_id}` : ""}</p>
      <p className="mt-1 break-all text-[11px] text-[#8A8178]">Solicitud {item.request_id}</p>
    </article>)}</div>
  </section>;
}
