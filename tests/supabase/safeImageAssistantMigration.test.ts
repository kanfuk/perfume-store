import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const migration = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260804000000_safe_image_assistant_history.sql"),
  "utf8"
);

describe("safe image assistant migration", () => {
  it("mantiene una clave idempotente por producto y URL normalizada", () => {
    expect(migration).toContain("unique (product_id, normalized_source_url)");
  });
  it("impide aplicar el mismo hash a dos productos", () => {
    expect(migration).toContain("product_image_assistant_applied_hash_uidx");
    expect(migration).toContain("where status = 'APPLIED'");
  });
  it("no concede acceso público al historial", () => {
    expect(migration).toContain("revoke all on table public.product_image_assistant_attempts from anon, authenticated");
    expect(migration).toContain("grant select, insert, update on table public.product_image_assistant_attempts to service_role");
  });
});
