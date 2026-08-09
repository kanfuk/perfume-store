import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260812030000_smellme_pending_admin_rls_guard.sql"
  ),
  "utf8"
);

describe("barrera RLS para invitaciones administrativas pendientes", () => {
  it("exige onboarding completo además de email y perfil activo", () => {
    expect(migration).toContain("create or replace function public.is_active_admin()");
    expect(migration).toContain("usuarios_admin.activo = true");
    expect(migration).toContain("usuarios_admin.onboarding_completed_at is not null");
  });

  it("conserva SECURITY INVOKER y un search_path fijo", () => {
    expect(migration).toContain("security invoker");
    expect(migration).toContain("set search_path = public");
    expect(migration).not.toMatch(/security definer/i);
  });
});
