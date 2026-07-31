import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260731000000_grant_service_role_payment_settings_columns.sql"
);
const sql = readFileSync(migrationPath, "utf8");

describe("migracion de privilegios de business_settings", () => {
  it("no modifica estructura ni datos", () => {
    expect(sql).not.toMatch(/\b(insert|update\s+public|delete|alter\s+table|create\s+table|drop\s+table)\b/i);
  });

  it("no otorga permisos a anon ni authenticated", () => {
    expect(sql).not.toMatch(/\bgrant\b[\s\S]*\bto\s+(anon|authenticated)\b/i);
    expect(sql).toMatch(/revoke all on table public\.business_settings from anon/i);
    expect(sql).toMatch(/revoke all on table public\.business_settings from authenticated/i);
  });

  it("no usa REVOKE ALL sobre service_role", () => {
    expect(sql).not.toMatch(/revoke all on table public\.business_settings from service_role/i);
  });

  it("concede solo SELECT y UPDATE de las columnas del flujo", () => {
    expect(sql).toMatch(/grant select\s*\([\s\S]*\)\s*on table public\.business_settings to service_role/i);
    expect(sql).toMatch(/grant update\s*\([\s\S]*\)\s*on table public\.business_settings to service_role/i);
    expect(sql).not.toMatch(/grant\s+(insert|delete|truncate|references|trigger)/i);
  });
});
