import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260812010000_smellme_admin_onboarding_completion.sql",
  "utf8"
);

describe("migración de onboarding explícito", () => {
  it("agrega onboarding_completed_at de forma aditiva", () => {
    expect(sql).toMatch(/alter table public\.usuarios_admin[\s\S]*add column if not exists onboarding_completed_at timestamptz/);
    expect(sql).not.toMatch(/drop table|truncate|delete from/i);
  });

  it("backfill sólo perfiles preexistentes vinculados con Auth", () => {
    expect(sql).toContain("ua.invited_at is null");
    expect(sql).toContain("ua.onboarding_completed_at is null");
    expect(sql).toMatch(/exists \([\s\S]*from auth\.users/);
  });

  it("no toca tablas comerciales ni configuración Top", () => {
    expect(sql).not.toMatch(/productos|pedidos|clientes|business_settings|top_ranking/i);
  });
});
