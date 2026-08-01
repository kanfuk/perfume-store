import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260806000000_smellme_full_operational_reset.sql", "utf8");
const safeUpdateSql = readFileSync("supabase/migrations/20260806010000_smellme_full_operational_reset_safeupdate.sql", "utf8");

describe("migración de reset operacional total", () => {
  it("separa preview, backup y reset con permisos exclusivos", () => {
    expect(sql).toContain("preview_smellme_full_operational_reset_v1");
    expect(sql).toContain("prepare_smellme_full_operational_backup_v1");
    expect(sql).toContain("reset_smellme_full_operational_data_v1");
    expect(sql).toContain("ELIMINAR TODA LA DATA OPERATIVA");
    expect(sql).toMatch(/revoke all on function public\.reset_smellme_full_operational_data_v1\([^)]+\) from public, anon, authenticated/i);
    expect(sql).toMatch(/grant execute on function public\.reset_smellme_full_operational_data_v1\([^)]+\) to service_role/i);
  });

  it("usa lock, fingerprint, backup e idempotencia sin SQL dinámico ni truncate", () => {
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("p_expected_fingerprint");
    expect(sql).toContain("p_backup_fingerprint");
    expect(sql).toContain("idempotency_key");
    expect(sql).toContain("replayed");
    expect(sql).not.toMatch(/\btruncate\b/i);
    expect(sql).not.toMatch(/\bexecute\s+format\b/i);
    expect(sql).not.toMatch(/create\s+temporary\s+table/i);
  });

  it.each(["fiados", "pagos", "pedido_items", "pedidos", "clientes", "product_image_assistant_attempts", "productos", "archivo_fiados", "archivo_pagos", "archivo_pedido_items", "archivo_pedidos", "archivo_clientes", "operaciones_admin_log", "smellme_qa_registry"])("elimina explícitamente public.%s", (table) => {
    expect(sql).toMatch(new RegExp(`delete from public\\.${table}\\s*;`, "i"));
  });

  it("preserva Auth, admin, configuración bancaria, WhatsApp y branding", () => {
    expect(sql).not.toMatch(/delete\s+from\s+auth\.users/i);
    expect(sql).not.toMatch(/delete\s+from\s+public\.usuarios_admin/i);
    expect(sql).not.toMatch(/delete\s+from\s+public\.business_settings/i);
    expect(sql).toContain("v_auth_count");
    expect(sql).toContain("v_admin_hash");
    expect(sql).toContain("v_business_hash");
    expect(sql).toContain("bankConfigurationComplete");
    expect(sql).toContain("brandingPreserved");
  });

  it("verifica rollback lógico, reportes en cero y reinicia sólo la secuencia comercial", () => {
    expect(sql).toContain("FULLRESET007: quedaron datos operativos; transacción revertida");
    expect(sql).toContain("FULLRESET008: configuración preservada cambió; transacción revertida");
    expect(sql).toContain("amountSold");
    expect(sql).toContain("grossProfit");
    expect(sql).toContain("setval('public.perfume_order_code_seq', 1, false)");
    expect(sql.match(/setval\(/g)).toHaveLength(1);
  });

  it("limita Storage al prefijo products/ y conserva pendientes reintentables", () => {
    expect(sql).toContain("smellme_full_reset_storage_pending");
    expect(sql).toContain("storage_path like 'products/%'");
    expect(sql).toContain("position('..' in storage_path) = 0");
    expect(sql).not.toMatch(/storage\.objects\s*(where|;)/i);
  });

  it("mantiene los borrados explícitos compatibles con safeupdate sin ampliar permisos", () => {
    const executable = safeUpdateSql.replace(/^--.*$/gm, "");
    expect(safeUpdateSql).toContain("create or replace function public.reset_smellme_full_operational_data_v1");
    expect(safeUpdateSql.match(/delete from public\.[a-z_]+ where true;/g)).toHaveLength(14);
    expect(executable).not.toMatch(/\btruncate\b/i);
    expect(executable).not.toMatch(/grant\s+/i);
    expect(executable).not.toMatch(/alter\s+role|safeupdate\s*=\s*off/i);
  });
});
