import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260813000000_smellme_admin_audit_log.sql", "utf8").replace(/--.*$/gm, "");

describe("admin audit log migration", () => {
  it("crea una bitácora aditiva con actor, acción, entidad, request y snapshots", () => {
    expect(sql).toMatch(/create table if not exists public\.admin_audit_log/i);
    for (const field of ["actor_admin_id", "actor_auth_user_id", "actor_role", "action", "entity_type", "entity_id", "request_id", "before_snapshot", "after_snapshot", "metadata"]) {
      expect(sql).toContain(field);
    }
  });

  it("es append-only incluso para service_role", () => {
    expect(sql).toMatch(/before update or delete on public\.admin_audit_log/i);
    expect(sql).toMatch(/ADMIN_AUDIT_LOG_APPEND_ONLY/i);
    expect(sql).toMatch(/grant select, insert on table public\.admin_audit_log to service_role/i);
    expect(sql).not.toMatch(/grant[^;]*(update|delete)[^;]*admin_audit_log/i);
  });

  it("solo OWNER activo y completamente incorporado puede leer con RLS", () => {
    expect(sql).toMatch(/ua\.rol = 'OWNER'/i);
    expect(sql).toMatch(/ua\.activo = true/i);
    expect(sql).toMatch(/ua\.onboarding_completed_at is not null/i);
  });

  it("no modifica tablas comerciales ni auth", () => {
    expect(sql).not.toMatch(/\b(truncate|drop table)\b/i);
    expect(sql).not.toMatch(/(insert|update|delete)\s+(into\s+|from\s+)?public\.(productos|pedidos|clientes)/i);
  });
});
