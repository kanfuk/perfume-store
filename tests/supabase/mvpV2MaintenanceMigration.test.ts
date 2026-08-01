import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260805000000_smellme_mvp_v2_maintenance.sql", "utf8");

describe("migración de mantenimiento MVP V2", () => {
  it("expone previews y mutaciones separadas con lock e idempotencia", () => {
    expect(sql).toContain("preview_smellme_qa_cleanup_v1");
    expect(sql).toContain("cleanup_smellme_qa_data_v1");
    expect(sql).toContain("preview_smellme_catalog_reset_v1");
    expect(sql).toContain("reset_smellme_catalog_v1");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("smellme_maintenance_runs");
  });

  it("no usa fecha, monto, estado ni origen como evidencia QA", () => {
    const helper = sql.slice(sql.indexOf("create or replace function public.is_smellme_qa_record_v1"), sql.indexOf("create or replace function public.preview_smellme_qa_cleanup_v1"));
    expect(helper).toMatch(/zztest|example\\\.com|qa-%|products\/qa/);
    expect(helper).not.toMatch(/fecha|monto|origen_pedido|estado_pedido/);
  });

  it("protege historial, reservas y permisos", () => {
    expect(sql).toContain("'BLOQUEADO'");
    expect(sql).toContain("stock_reservado > 0");
    expect(sql).toContain("historicalOrdersPreserved");
    expect(sql).toMatch(/revoke all on function public\.admin_limpiar_datos_prueba\(text, text\) from service_role/i);
    expect(sql).toMatch(/revoke all on function public\.reset_smellme_catalog_v1\(text,text\) from public, anon, authenticated/i);
  });
});
