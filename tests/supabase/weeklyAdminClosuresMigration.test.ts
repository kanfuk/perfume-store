import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Fase 7.6A: la migracion de cierres semanales queda preparada en el
 * repositorio pero NUNCA se aplico contra Supabase remoto (ver
 * docs/SMELLME_WEEKLY_CLOSURES_DESIGN.md). Mismo patron de inspeccion
 * estatica que tests/supabase/customerBanlistMigration.test.ts.
 */
const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260810000000_smellme_weekly_admin_closures.sql"
);
const sql = readFileSync(migrationPath, "utf8");
const sqlCode = sql.replace(/--.*$/gm, "");

describe("migracion de cierres semanales (20260810000000_smellme_weekly_admin_closures.sql)", () => {
  it("crea la tabla de forma aditiva (CREATE TABLE IF NOT EXISTS), nunca DROP/RENAME/TRUNCATE", () => {
    expect(sqlCode).toMatch(/create table if not exists public\.cierres_semanales/i);
    expect(sqlCode).not.toMatch(/\bdrop\s+(table|column)\b/i);
    expect(sqlCode).not.toMatch(/\brename\b/i);
    expect(sqlCode).not.toMatch(/\btruncate\b/i);
  });

  it("nunca modifica datos existentes (sin INSERT/UPDATE/DELETE) ni toca pedidos/productos/clientes", () => {
    expect(sqlCode).not.toMatch(/^\s*insert\s+into\s+public\.(pedidos|productos|clientes|pagos|fiados)/im);
    expect(sqlCode).not.toMatch(/^\s*update\s+public\.(pedidos|productos|clientes|pagos|fiados)\s+set/im);
    expect(sqlCode).not.toMatch(/^\s*delete\s+from\s+public\.(pedidos|productos|clientes|pagos|fiados)/im);
    expect(sqlCode).not.toMatch(/alter table public\.(pedidos|productos|clientes)\b/i);
  });

  it("status usa un conjunto controlado CLOSED/REOPENED (check constraint), nunca texto libre", () => {
    expect(sqlCode).toMatch(/status\s+text\s+not\s+null/i);
    expect(sqlCode).toMatch(/check\s*\(status\s+in\s*\('closed',\s*'reopened'\)\)/i);
  });

  it("version es entera positiva (check > 0)", () => {
    expect(sqlCode).toMatch(/constraint\s+cierres_semanales_version_check\s+check\s*\(version\s*>\s*0\)/i);
  });

  it("period_start debe ser anterior a period_end_exclusive (check constraint real, no solo en la app)", () => {
    expect(sqlCode).toMatch(/constraint\s+cierres_semanales_period_check\s+check\s*\(period_start\s*<\s*period_end_exclusive\)/i);
  });

  it("profit_amount NO tiene CHECK de no-negatividad (una semana puede cerrar con perdida real)", () => {
    const amountsCheckMatch = sqlCode.match(/constraint\s+cierres_semanales_amounts_check\s+check\s*\(([\s\S]*?)\)/i);
    expect(amountsCheckMatch).not.toBeNull();
    expect(amountsCheckMatch?.[1]).not.toMatch(/profit_amount/i);
    expect(amountsCheckMatch?.[1]).toMatch(/gross_sales/i);
    expect(amountsCheckMatch?.[1]).toMatch(/income_amount/i);
    expect(amountsCheckMatch?.[1]).toMatch(/cost_amount/i);
    expect(amountsCheckMatch?.[1]).toMatch(/outstanding_amount/i);
  });

  it("reopen_reason exige entre 5 y 500 caracteres cuando no es null", () => {
    expect(sqlCode).toMatch(/char_length\(btrim\(reopen_reason\)\)\s*>=\s*5/i);
    expect(sqlCode).toMatch(/char_length\(reopen_reason\)\s*<=\s*500/i);
  });

  it("crea el indice unico parcial que impide dos cierres CLOSED activos del mismo periodo", () => {
    expect(sqlCode).toMatch(
      /create unique index if not exists cierres_semanales_periodo_activo_idx\s+on public\.cierres_semanales \(period_start, period_end_exclusive\)\s+where status = 'closed'/i
    );
  });

  it("habilita RLS y restringe la lectura a administradores activos", () => {
    expect(sqlCode).toMatch(/alter table public\.cierres_semanales enable row level security/i);
    expect(sqlCode).toMatch(/using \(public\.is_active_admin\(\)\)/i);
  });

  it("anon y authenticated no reciben ningun privilegio de tabla; solo service_role puede escribir", () => {
    expect(sqlCode).toMatch(/revoke all on table public\.cierres_semanales from anon/i);
    expect(sqlCode).toMatch(/revoke all on table public\.cierres_semanales from authenticated/i);
    expect(sqlCode).toMatch(/grant select, insert, update on table public\.cierres_semanales to service_role/i);
  });

  it("create_weekly_closure_v1 y reopen_weekly_closure_v1 son security definer y solo service_role tiene execute", () => {
    expect(sqlCode).toMatch(/create or replace function public\.create_weekly_closure_v1/i);
    expect(sqlCode).toMatch(/create or replace function public\.reopen_weekly_closure_v1/i);
    expect(sqlCode).toMatch(/security definer/i);
    expect(sqlCode).toMatch(
      /grant execute on function public\.create_weekly_closure_v1\([^)]*\) to service_role/i
    );
    expect(sqlCode).toMatch(
      /grant execute on function public\.reopen_weekly_closure_v1\([^)]*\) to service_role/i
    );
    expect(sqlCode).not.toMatch(/grant execute on function public\.create_weekly_closure_v1[\s\S]{0,80}to (anon|authenticated)/i);
  });

  it("create_weekly_closure_v1 traduce la violacion de indice unico a un codigo propio (WC001), nunca expone el error crudo de Postgres", () => {
    expect(sqlCode).toMatch(/when unique_violation then/i);
    expect(sqlCode).toMatch(/errcode = 'wc001'/i);
  });

  it("reopen_weekly_closure_v1 usa SELECT ... FOR UPDATE (bloqueo de fila real, no en aplicacion)", () => {
    expect(sqlCode).toMatch(/select \* into v_row from public\.cierres_semanales where id = p_closure_id for update/i);
  });

  it("reopen_weekly_closure_v1 rechaza reabrir un cierre ya reabierto (WC003, conflicto explicito)", () => {
    expect(sqlCode).toMatch(/if v_row\.status = 'reopened' then/i);
    expect(sqlCode).toMatch(/errcode = 'wc003'/i);
  });
});

describe("Fase 7.6A: la migracion NO fue aplicada remotamente", () => {
  it("el documento de diseño confirma explicitamente que no se aplico", () => {
    const design = readFileSync(path.join(process.cwd(), "docs/SMELLME_WEEKLY_CLOSURES_DESIGN.md"), "utf8");
    expect(design).toMatch(/no se ejecut[oó]|no fue aplicada/i);
  });
});
