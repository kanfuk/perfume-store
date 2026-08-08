import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("UX de perfiles operativos", () => {
  it("marca el OWNER principal y oculta sus acciones peligrosas", () => {
    const panel = source("components/admin/AdminUsersPanel.tsx");
    expect(panel).toContain("OWNER · Cuenta principal");
    expect(panel).toContain("!user.isPrimaryOwner");
    expect(panel).toContain("Configurar cuenta");
    expect(panel).toContain("maskedAccountNumber");
  });

  it("la invitación normal expone únicamente ADMIN", () => {
    const panel = source("components/admin/AdminUsersPanel.tsx");
    expect(panel).toContain('role: "ADMIN"');
    expect(panel).not.toContain('<option value="OWNER">');
  });

  it("OWNER tiene selector explícito y ADMIN no envía identidad receptora", () => {
    const dashboard = source("components/admin/AdminDashboard.tsx");
    expect(dashboard).toContain("Cuenta receptora");
    expect(dashboard).toContain("needsReceiver");
    expect(dashboard).toContain("Selecciona un ADMIN");
  });
});
