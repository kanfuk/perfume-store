import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260812040000_smellme_single_primary_owner.sql",
  "utf8"
);

describe("migración de OWNER único e inmutable", () => {
  it("conserva determinísticamente el OWNER histórico y degrada solo duplicados", () => {
    expect(sql).toMatch(/where rol = 'OWNER'[\s\S]*order by created_at asc, id asc[\s\S]*limit 1/);
    expect(sql).toMatch(/update public\.usuarios_admin\s+set rol = 'ADMIN'\s+where rol = 'OWNER'\s+and id <> primary_owner_id/);
    expect(sql).not.toMatch(/delete\s+from\s+(public\.)?usuarios_admin/i);
    expect(sql).not.toMatch(/(insert|delete|update)\s+(into\s+|from\s+)?auth\.users/i);
  });

  it("preserva onboarding, Auth, estado y demás identidad del perfil QA", () => {
    const reconciliation = sql.match(/update public\.usuarios_admin[\s\S]*?;/)?.[0] ?? "";
    expect(reconciliation).toContain("set rol = 'ADMIN'");
    expect(reconciliation).not.toMatch(/auth_user_id\s*=/);
    expect(reconciliation).not.toMatch(/onboarding_completed_at\s*=/);
    expect(reconciliation).not.toMatch(/activo\s*=/);
    expect(reconciliation).not.toMatch(/email\s*=/);
    expect(reconciliation).not.toMatch(/nombre\s*=/);
  });

  it("impone máximo un OWNER y exige que permanezca activo", () => {
    expect(sql).toMatch(/create unique index[\s\S]*usuarios_admin_single_owner_idx[\s\S]*on public\.usuarios_admin \(rol\)[\s\S]*where rol = 'OWNER'/);
    expect(sql).toContain("check (rol <> 'OWNER' or activo = true)");
  });

  it("impide eliminar, degradar o desactivar al OWNER principal", () => {
    expect(sql).toContain("ADMIN_PRIMARY_OWNER_IMMUTABLE");
    expect(sql).toMatch(/old\.rol = 'OWNER'[\s\S]*tg_op = 'DELETE'[\s\S]*new\.rol <> 'OWNER'[\s\S]*new\.activo is distinct from true/);
    expect(sql).toMatch(/before update or delete on public\.usuarios_admin/);
  });
});
