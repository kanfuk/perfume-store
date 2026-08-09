import { NextResponse } from "next/server";
import { ADMIN_AUDIT_ACTIONS } from "@/lib/admin-audit";
import { getAuthenticatedAdmin, isOwnerAdmin } from "@/lib/admin-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = await getAuthenticatedAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  if (!isOwnerAdmin(admin)) return NextResponse.json({ error: "Acceso solo para OWNER." }, { status: 403 });

  const params = new URL(request.url).searchParams;
  const limit = Math.min(Math.max(Number(params.get("limit")) || 50, 1), 100);
  let query = createSupabaseServerClient()
    .from("admin_audit_log")
    .select("id,created_at,actor_admin_id,actor_role,action,entity_type,entity_id,request_id,metadata,usuarios_admin(nombre,email)")
    .order("created_at", { ascending: false })
    .limit(limit);

  const actor = params.get("actor");
  const action = params.get("action");
  const entity = params.get("entity");
  const from = params.get("from");
  const to = params.get("to");
  if (actor) query = query.eq("actor_admin_id", actor);
  if (action && ADMIN_AUDIT_ACTIONS.includes(action as never)) query = query.eq("action", action);
  if (entity) query = query.eq("entity_type", entity);
  if (from) query = query.gte("created_at", `${from}T00:00:00-04:00`);
  if (to) query = query.lt("created_at", `${to}T23:59:59.999-04:00`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "No fue posible cargar la actividad." }, { status: 500 });
  return NextResponse.json({ items: data ?? [], actions: ADMIN_AUDIT_ACTIONS }, {
    headers: { "Cache-Control": "private, no-store" }
  });
}

