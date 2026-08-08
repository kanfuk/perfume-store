import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260812000000_smellme_admin_invitations.sql", "utf8");

describe("migración de administradores por invitación", () => {
  it("vincula autorización con Auth sin almacenar contraseñas", () => {
    expect(sql).toContain("auth_user_id uuid references auth.users(id) on delete set null");
    expect(sql).toContain("invited_at timestamptz");
    expect(sql).not.toMatch(/password|contrase/i);
  });

  it("restringe roles y normaliza correos", () => {
    expect(sql).toContain("rol in ('OWNER', 'ADMIN')");
    expect(sql).toContain("email = lower(btrim(email))");
    expect(sql).toContain("usuarios_admin_email_normalized_unique_idx");
  });

  it("protege al último OWNER incluso ante carreras concurrentes", () => {
    expect(sql).toContain("prevent_last_active_owner_change_v1");
    expect(sql).toContain("ADMIN_LAST_OWNER");
    expect(sql).toMatch(/before update or delete on public\.usuarios_admin/);
    expect(sql).toMatch(/count\(\*\)[\s\S]*where activo = true and rol = 'OWNER'/);
  });

  it("mantiene Auth inaccesible desde clientes y limita escrituras a service_role", () => {
    expect(sql).toMatch(/revoke all on table public\.usuarios_admin from public, anon/);
    expect(sql).toMatch(/revoke insert, update, delete[\s\S]*from authenticated/);
    expect(sql).toMatch(/grant select, insert, update on table public\.usuarios_admin to service_role/);
    expect(sql).not.toMatch(/grant [^;]* on [^;]*auth\.users/i);
  });
});
