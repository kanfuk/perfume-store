import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("UX de perfiles operativos", () => {
  it("marca el OWNER principal y elimina sus acciones peligrosas", () => {
    const panel = source("components/admin/AdminUsersPanel.tsx");
    expect(panel).toContain("OWNER · Cuenta principal");
    expect(panel).toContain("Configurar cuenta");
    expect(panel).toContain("maskedAccountNumber");
    expect(panel).not.toContain("Hacer OWNER");
    expect(panel).not.toContain('action: "set-role"');
    expect(panel).toContain('user.role === "ADMIN"');
  });

  it("la invitación no permite enviar un rol desde el browser", () => {
    const panel = source("components/admin/AdminUsersPanel.tsx");
    expect(panel).toContain("JSON.stringify({ name, email })");
    expect(panel).not.toContain('<option value="OWNER">');
    expect(panel).not.toContain('role: "OWNER"');
  });

  it("OWNER tiene selector explícito y ADMIN no envía identidad receptora", () => {
    const dashboard = source("components/admin/AdminDashboard.tsx");
    expect(dashboard).toContain("Cuenta receptora");
    expect(dashboard).toContain("needsReceiver");
    expect(dashboard).toContain("Selecciona un ADMIN");
  });
});
