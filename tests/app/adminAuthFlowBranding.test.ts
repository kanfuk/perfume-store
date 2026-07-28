import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const LEGACY_BRANDING_PATTERN = /pauli|dobladita/i;

const newAuthFlowFiles = [
  "app/auth/callback/route.ts",
  "app/admin/set-password/page.tsx",
  "components/admin/AdminSetPasswordForm.tsx",
  "components/admin/AdminLoginForm.tsx"
];

describe("flujo nuevo de recuperacion de contraseña - sin branding heredado", () => {
  it.each(newAuthFlowFiles)("%s no contiene referencias a Pauli Store ni dobladitas", (relativePath) => {
    const content = readFileSync(path.join(process.cwd(), relativePath), "utf8");

    expect(content).not.toMatch(LEGACY_BRANDING_PATTERN);
  });
});

describe("/admin/set-password es una ruta publica", () => {
  it("no depende de isAdminAuthenticated ni de usuarios_admin", () => {
    const content = readFileSync(
      path.join(process.cwd(), "app/admin/set-password/page.tsx"),
      "utf8"
    );

    expect(content).not.toMatch(/isAdminAuthenticated/);
    expect(content).not.toMatch(/usuarios_admin/);
  });
});
