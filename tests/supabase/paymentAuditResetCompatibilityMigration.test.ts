import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260813010000_preserve_payment_audits_on_commercial_reset.sql", "utf8").replace(/--.*$/gm, "");

describe("preservación de auditorías de pago durante reset comercial", () => {
  it("conserva la auditoría y solo desprende el pedido eliminado", () => {
    expect(sql).toMatch(/alter column pedido_id drop not null/i);
    expect(sql).toMatch(/foreign key \(pedido_id\).*on delete set null/is);
    expect(sql).not.toMatch(/delete from public\.admin_payment_message_audits/i);
  });

  it("mantiene bloqueado cualquier cambio distinto de la nulificación de FK", () => {
    expect(sql).toMatch(/old\.pedido_id is not null/i);
    expect(sql).toMatch(/new\.pedido_id is null/i);
    expect(sql).toMatch(/old\.bank_snapshot = new\.bank_snapshot/i);
    expect(sql).toMatch(/ADMIN_PAYMENT_AUDIT_IMMUTABLE/i);
    expect(sql).toMatch(/revoke all.*public, anon, authenticated/is);
  });
});
