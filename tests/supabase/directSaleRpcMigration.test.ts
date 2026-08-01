import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260801000000_perfume_store_direct_sale_rpc.sql"
);
const sql = readFileSync(migrationPath, "utf8");

describe("migracion de create_direct_sale_v1", () => {
  it("agrega la columna de idempotencia con indice unico parcial", () => {
    expect(sql).toMatch(/alter table public\.pedidos add column if not exists idempotency_key text/i);
    expect(sql).toMatch(
      /create unique index if not exists pedidos_idempotency_key_unique_idx\s*\n\s*on public\.pedidos \(idempotency_key\)\s*\n\s*where idempotency_key is not null/i
    );
  });

  it("no modifica ni reemplaza las RPC transaccionales existentes", () => {
    expect(sql).not.toMatch(/create or replace function public\.create_perfume_order_v1/i);
    expect(sql).not.toMatch(/create or replace function public\.mark_perfume_order_paid_v1/i);
    expect(sql).not.toMatch(/create or replace function public\.cancel_perfume_order_v1/i);
  });

  it("valida producto activo y stock disponible dentro del bloqueo for update", () => {
    expect(sql).toMatch(/for update/i);
    expect(sql).toMatch(/v_producto_row\.activo is not true/);
    expect(sql).toMatch(
      /\(v_producto_row\.stock_actual - v_producto_row\.stock_reservado\) < v_qty/
    );
  });

  it("nunca otorga insert/delete/truncate ni acceso a anon/authenticated sobre la funcion", () => {
    expect(sql).not.toMatch(/grant\s+(insert|delete|truncate)\b/i);
    expect(sql).not.toMatch(/\bgrant\b[\s\S]*\bto\s+(anon|authenticated)\b/i);
    expect(sql).toMatch(
      /revoke all on function public\.create_direct_sale_v1\([^)]*\) from public/i
    );
    expect(sql).toMatch(
      /revoke all on function public\.create_direct_sale_v1\([^)]*\) from anon/i
    );
    expect(sql).toMatch(
      /revoke all on function public\.create_direct_sale_v1\([^)]*\) from authenticated/i
    );
    expect(sql).toMatch(
      /grant execute on function public\.create_direct_sale_v1\([^)]*\) to service_role/i
    );
  });

  it("resuelve un replay idempotente sin volver a insertar cuando la clave ya existe", () => {
    expect(sql).toMatch(/where idempotency_key = v_key/i);
    expect(sql).toMatch(/return v_existing;/);
  });

  it("solo acepta EFECTIVO o TRANSFERENCIA como forma de pago", () => {
    expect(sql).toMatch(/p_forma_pago not in \('EFECTIVO', 'TRANSFERENCIA'\)/);
  });

  it("no contiene datos reales de clientes ni credenciales", () => {
    expect(sql).not.toMatch(/@gmail\.com|@hotmail\.com|password|service_role_key/i);
  });
});
