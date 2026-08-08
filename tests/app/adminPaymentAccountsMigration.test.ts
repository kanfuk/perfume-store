import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(path.join(process.cwd(), "supabase/migrations/20260812020000_smellme_admin_payment_accounts.sql"), "utf8");

describe("migración de cuentas y auditoría de cobro", () => {
  it("crea una relación 1:1 sin inventar cuentas", () => {
    expect(migration).toContain("admin_user_id uuid not null unique");
    expect(migration).toContain("references public.usuarios_admin(id)");
    expect(migration).not.toMatch(/insert into public\.admin_payment_accounts/i);
  });

  it("cierra datos bancarios a anon/authenticated y deja auditoría append-only", () => {
    expect(migration).toContain("revoke all on table public.admin_payment_accounts from public, anon, authenticated");
    expect(migration).toContain("revoke all on table public.admin_payment_message_audits from public, anon, authenticated");
    expect(migration).toContain("before update or delete on public.admin_payment_message_audits");
    expect(migration).toContain("bank_snapshot jsonb not null");
  });
});
