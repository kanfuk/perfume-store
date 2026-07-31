import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("privacidad de configuracion bancaria", () => {
  it.each([
    "app/api/products/route.ts",
    "app/api/orders/route.ts",
    "app/page.tsx"
  ])("%s no consulta ni expone business_settings", (relativePath) => {
    const content = source(relativePath);
    expect(content).not.toMatch(/business_settings|numero_cuenta|rut_titular/i);
  });

  it("el dashboard usa solo el endpoint summary fuera de la edicion", () => {
    const content = source("components/admin/AdminDashboard.tsx");
    expect(content).toContain("/api/admin/settings/payment?summary=1");
    expect(content).not.toMatch(/paymentInfo|accountNumber/);
  });
});

describe("rutas y acciones de configuracion/pedidos", () => {
  it("la ruta configuracion exige autenticacion y conserva Seguridad", () => {
    const page = source("app/admin/configuracion/page.tsx");
    const panel = source("components/admin/BusinessSettingsPanel.tsx");
    expect(page).toContain("isAdminAuthenticated");
    expect(panel).toContain("Seguridad");
    expect(panel).toContain("/admin/set-password");
  });

  it("el dashboard enlaza configuracion y la alerta de transferencia", () => {
    const dashboard = source("components/admin/AdminDashboard.tsx");
    const home = source("components/admin/dashboard/DashboardHomeView.tsx");
    expect(dashboard).toContain('router.push("/admin/configuracion")');
    expect(home).toContain("Configura tus datos bancarios");
    expect(home).toContain("/admin/configuracion?seccion=transferencia");
  });

  it("abre un placeholder antes de esperar la API y ofrece fallback manual", () => {
    const dashboard = source("components/admin/AdminDashboard.tsx");
    expect(dashboard).toContain('window.open("about:blank", "_blank")');
    expect(dashboard).toContain("Abrir WhatsApp manualmente");
    expect(dashboard).toContain("closeWhatsAppPlaceholder");
  });

  it("muestra las acciones requeridas por estado", () => {
    const dashboard = source("components/admin/AdminDashboard.tsx");
    expect(dashboard).toContain("Atender y solicitar transferencia");
    expect(dashboard).toContain("Reenviar datos de pago");
    expect(dashboard).toContain("Coordinar entrega por WhatsApp");
    expect(dashboard).toContain("Pago confirmado");
  });
});
