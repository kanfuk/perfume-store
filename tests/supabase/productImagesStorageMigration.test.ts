import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260803000000_perfume_store_product_images_storage.sql"
);
const sql = readFileSync(migrationPath, "utf8");

describe("migracion del bucket product-images", () => {
  it("crea el bucket como publico de solo lectura", () => {
    expect(sql).toMatch(/insert into storage\.buckets/i);
    expect(sql).toMatch(/'product-images',\s*'product-images',\s*true/i);
  });

  it("limita tamano y mime a nivel de bucket", () => {
    expect(sql).toMatch(/file_size_limit/i);
    expect(sql).toMatch(/allowed_mime_types/i);
    expect(sql).toMatch(/array\['image\/webp'\]/i);
  });

  it("permite lectura publica de los objetos del bucket", () => {
    expect(sql).toMatch(/create policy[\s\S]*?for select[\s\S]*?to public[\s\S]*?using \(bucket_id = 'product-images'\)/i);
  });

  it("acota escritura (insert/update/delete) solo a service_role", () => {
    expect(sql).toMatch(/create policy[\s\S]*?for insert[\s\S]*?to service_role/i);
    expect(sql).toMatch(/create policy[\s\S]*?for update[\s\S]*?to service_role/i);
    expect(sql).toMatch(/create policy[\s\S]*?for delete[\s\S]*?to service_role/i);
  });

  it("nunca otorga escritura a anon ni authenticated", () => {
    expect(sql).not.toMatch(/for (insert|update|delete)[\s\S]*?to (anon|authenticated)/i);
  });

  it("no modifica ninguna tabla ni funcion existente", () => {
    expect(sql).not.toMatch(/\balter table public\./i);
    expect(sql).not.toMatch(/create or replace function/i);
    expect(sql).not.toMatch(/\bdrop\b/i);
  });

  it("no contiene datos reales de clientes ni credenciales", () => {
    expect(sql).not.toMatch(/@gmail\.com|@hotmail\.com|password|service_role_key/i);
  });
});
