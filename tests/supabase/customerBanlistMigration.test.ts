import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Fase 7.5A: la migracion de la banlist de clientes queda preparada en el
 * repositorio pero NUNCA se aplico contra Supabase remoto (ver
 * docs/SMELLME_CUSTOMER_BANLIST_DESIGN.md). Este archivo verifica por
 * inspeccion estatica del SQL -- mismo patron que
 * tests/supabase/paymentSettingsMigration.test.ts -- que es puramente
 * aditiva y no otorga privilegios indebidos.
 */
const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260807000000_smellme_customer_banlist.sql"
);
const sql = readFileSync(migrationPath, "utf8");
// Comentarios de linea ("-- ...") explican a proposito que NO hay
// GRANT/REVOKE/DROP/RENAME/TRUNCATE ni la sintaxis invalida "ADD CONSTRAINT
// IF NOT EXISTS" -- mencionarlos en prosa no debe hacer fallar las
// aserciones que verifican SQL ejecutable real. Se filtran los comentarios
// para esas aserciones estructurales.
const sqlCode = sql.replace(/--.*$/gm, "");

describe("migracion de banlist de clientes (20260807000000_smellme_customer_banlist.sql)", () => {
  it("es puramente aditiva: solo ADD COLUMN/ADD CONSTRAINT/CREATE INDEX, nunca DROP/RENAME/TRUNCATE", () => {
    expect(sqlCode).toMatch(/add column if not exists bloqueado/i);
    expect(sqlCode).not.toMatch(/\bdrop\s+(table|column)\b/i);
    expect(sqlCode).not.toMatch(/\brename\b/i);
    expect(sqlCode).not.toMatch(/\btruncate\b/i);
  });

  it("nunca modifica datos existentes (sin INSERT/UPDATE/DELETE)", () => {
    expect(sqlCode).not.toMatch(/^\s*insert\s+into/im);
    expect(sqlCode).not.toMatch(/^\s*update\s+public\.clientes\s+set/im);
    expect(sqlCode).not.toMatch(/^\s*delete\s+from/im);
  });

  it("bloqueado tiene default false: ningun cliente existente queda bloqueado", () => {
    expect(sqlCode).toMatch(/bloqueado\s+boolean\s+not\s+null\s+default\s+false/i);
  });

  it("no otorga ni revoca ningun privilegio nuevo (los de la tabla ya cubren las columnas nuevas)", () => {
    expect(sqlCode).not.toMatch(/\bgrant\b/i);
    expect(sqlCode).not.toMatch(/\brevoke\b/i);
  });

  it("motivo_bloqueo queda protegido por el mismo mecanismo de privilegios que el resto de la tabla (documentado, no un GRANT nuevo)", () => {
    expect(sql).toMatch(/motivo_bloqueo es exclusivamente administrativo/i);
  });

  it("agrega las 5 columnas esperadas de la banlist, todas opcionales salvo bloqueado", () => {
    expect(sql).toMatch(/add column if not exists motivo_bloqueo text/i);
    expect(sql).toMatch(/add column if not exists bloqueado_en timestamptz/i);
    expect(sql).toMatch(/add column if not exists desbloqueado_en timestamptz/i);
    expect(sql).toMatch(/add column if not exists bloqueado_por text/i);
  });

  it("bloqueado_por se documenta como identificador de administrador (userId), nunca correo/nombre ni token", () => {
    expect(sql).toMatch(/guarda el user\.id.*administrador/i);
  });

  it("agrega un constraint de longitud para motivo_bloqueo (5 a 500 caracteres) usando un bloque DO seguro de re-ejecutar", () => {
    expect(sql).toMatch(/add constraint\s+clientes_motivo_bloqueo_length/i);
    expect(sql).toMatch(/char_length\(btrim\(motivo_bloqueo\)\)\s*>=\s*5/i);
    expect(sql).toMatch(/char_length\(motivo_bloqueo\)\s*<=\s*500/i);
    // Postgres no soporta "ADD CONSTRAINT IF NOT EXISTS": debe usarse un
    // bloque DO + pg_constraint, nunca la sintaxis invalida directa.
    expect(sqlCode).not.toMatch(/add constraint if not exists/i);
    expect(sql).toMatch(/select 1 from pg_constraint where conname/i);
  });

  it("crea un indice parcial para listar clientes bloqueados sin escanear toda la tabla", () => {
    expect(sql).toMatch(/create index if not exists clientes_bloqueado_idx on public\.clientes \(bloqueado\) where bloqueado = true/i);
  });

  it("nunca toca RLS, Auth, CSP, stock, precios, productos ni pedidos", () => {
    expect(sql).not.toMatch(/\bpolicy\b/i);
    expect(sql).not.toMatch(/row level security/i);
    expect(sql).not.toMatch(/public\.productos/i);
    expect(sql).not.toMatch(/public\.pedidos/i);
  });
});

describe("Fase 7.5A: la migracion NO fue aplicada remotamente", () => {
  it("el documento de diseño confirma explicitamente que no se aplico", () => {
    const design = readFileSync(
      path.join(process.cwd(), "docs/SMELLME_CUSTOMER_BANLIST_DESIGN.md"),
      "utf8"
    );
    expect(design).toMatch(/no fue aplicada|no se aplic[oó]/i);
  });
});
