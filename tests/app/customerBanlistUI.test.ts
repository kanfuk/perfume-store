import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Fase 7.5A: verificacion por inspeccion de codigo fuente (mismo patron que
 * tests/app/top15OffersEditorialControl.test.ts, sin jsdom/RTL en este
 * proyecto) de la integracion de la banlist dentro de /admin/clientes
 * (AdminDashboard.tsx) -- badge, filtro, modal de bloqueo/desbloqueo,
 * y que el motivo nunca se filtra a superficies publicas.
 */
const dashboardSource = readFileSync("components/admin/AdminDashboard.tsx", "utf8");
const typesSource = readFileSync("components/admin/dashboard/admin-dashboard.types.ts", "utf8");
const routeSource = readFileSync("app/api/admin/customers/[customerId]/route.ts", "utf8");

describe("Fase 7.5A: filtro 'Bloqueados' integrado en /admin/clientes (sin admin paralelo)", () => {
  it("CustomerFilter incluye 'bloqueados'", () => {
    expect(typesSource).toMatch(/CustomerFilter = "todos" \| "con-pedidos" \| "con-fiado" \| "recientes" \| "bloqueados"/);
  });

  it("ClientFilterChips agrega el chip 'Bloqueados' con su contador", () => {
    expect(dashboardSource).toMatch(/\{ value: "bloqueados", label: "Bloqueados", count: counts\.bloqueados \}/);
  });

  it("el filtro 'bloqueados' filtra por customer.bloqueado en filteredCustomerCards", () => {
    const fnMatch = dashboardSource.match(/const filteredCustomerCards = useMemo\(\(\) => \{[\s\S]*?\}, \[customerCards, customerFilter, normalizedSearch\]\);/);
    expect(fnMatch?.[0]).toMatch(/customerFilter === "bloqueados"/);
    expect(fnMatch?.[0]).toMatch(/return customer\.bloqueado;/);
  });

  it("no crea una segunda administracion de clientes (todo vive dentro de view === \"clientes\")", () => {
    expect(existsSync("app/admin/clientes-bloqueados")).toBe(false);
    expect(existsSync("components/admin/CustomerBanlistPanel.tsx")).toBe(false);
  });
});

describe("Fase 7.5A: badge y estado visible en ClientCard", () => {
  it("muestra un badge 'Bloqueado' (ClientPill tone danger) cuando customer.bloqueado es true", () => {
    expect(dashboardSource).toMatch(/customer\.bloqueado \? <ClientPill label="Bloqueado" tone="danger" \/> : null/);
  });

  it("muestra el motivo y la fecha de bloqueo dentro de la ficha cuando esta bloqueado", () => {
    const cardMatch = dashboardSource.match(/function ClientCard\([\s\S]*?\n\}\n/);
    expect(cardMatch?.[0]).toMatch(/customer\.motivoBloqueo/);
    expect(cardMatch?.[0]).toMatch(/Bloqueado el \{formatShortDateTime\(customer\.bloqueadoEn\)\}/);
  });

  it("ofrece un boton 'Bloquear cliente' o 'Desbloquear' segun el estado, con touch target min-h-11", () => {
    const cardMatch = dashboardSource.match(/function ClientCard\([\s\S]*?\n\}\n/);
    expect(cardMatch?.[0]).toMatch(/Bloquear cliente/);
    expect(cardMatch?.[0]).toMatch(/Desbloquear/);
    expect(cardMatch?.[0]).toMatch(/min-h-11/);
  });
});

describe("Fase 7.5A: modal de bloqueo con motivo obligatorio", () => {
  it("existe CustomerBlockModal con textarea de motivo y contador de caracteres", () => {
    expect(dashboardSource).toMatch(/function CustomerBlockModal/);
    expect(dashboardSource).toMatch(/id="motivo-bloqueo-textarea"/);
    expect(dashboardSource).toMatch(/aria-describedby="motivo-bloqueo-counter"/);
  });

  it("el boton de confirmar queda deshabilitado si el motivo tiene menos de 5 caracteres (trim) o esta ocupado", () => {
    expect(dashboardSource).toMatch(/disabled=\{busy \|\| !canConfirm\}/);
    expect(dashboardSource).toMatch(/MOTIVO_BLOQUEO_MIN_LENGTH = 5/);
    expect(dashboardSource).toMatch(/MOTIVO_BLOQUEO_MAX_LENGTH = 500/);
  });

  it("desbloquear usa el confirm generico (feedback.confirm), no un modal con motivo", () => {
    const fnMatch = dashboardSource.match(/async function unblockCustomer\([\s\S]*?\n  \}\n/);
    expect(fnMatch?.[0]).toMatch(/feedback\.confirm\(/);
    expect(fnMatch?.[0]).toMatch(/¿Desbloquear a este cliente\?/);
  });

  it("blockCustomer y unblockCustomer llaman al mismo endpoint PATCH con action block/unblock", () => {
    const blockFn = dashboardSource.match(/async function blockCustomer\([\s\S]*?\n  \}\n/);
    expect(blockFn?.[0]).toMatch(/action: "block", reason \}/);
    const unblockFn = dashboardSource.match(/async function unblockCustomer\([\s\S]*?\n  \}\n/);
    expect(unblockFn?.[0]).toMatch(/action: "unblock" \}/);
  });

  it("previene doble submit: el boton de confirmar se deshabilita mientras busy", () => {
    expect(dashboardSource).toMatch(/\{busy \? "Bloqueando\.\.\." : "Bloquear cliente"\}/);
  });
});

describe("Fase 7.5A: motivo de bloqueo exclusivamente administrativo", () => {
  it("motivoBloqueo nunca aparece en componentes publicos (OffersSection, ProductCard, CatalogExplorer, OrderForm)", () => {
    const publicFiles = [
      "components/shared/OffersSection.tsx",
      "components/shared/ProductCard.tsx",
      "components/shared/CatalogExplorer.tsx",
      "components/OrderForm.tsx"
    ];
    for (const file of publicFiles) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/motivoBloqueo|bloqueado_por|bloqueadoPor/);
    }
  });

  it("el API publico de pedidos no expone motivoBloqueo, bloqueadoPor ni el detalle de la banlist", () => {
    const ordersRoute = readFileSync("app/api/orders/route.ts", "utf8");
    expect(ordersRoute).not.toMatch(/motivoBloqueo|bloqueado_por|CUSTOMER_BLOCKED/);
  });
});

describe("Fase 7.5A: API admin extendida sin romper el contrato de edicion existente", () => {
  it("PATCH usa getAuthenticatedAdmin() para resolver bloqueadoPor solo en la accion 'block'", () => {
    expect(routeSource).toMatch(/getAuthenticatedAdmin/);
    expect(routeSource).toMatch(/admin\?\.userId \?\? null/);
  });

  it("no crea un endpoint nuevo: sigue siendo el mismo archivo de ruta", () => {
    expect(existsSync("app/api/admin/customers/[customerId]/block/route.ts")).toBe(false);
    expect(existsSync("app/api/admin/banlist/route.ts")).toBe(false);
  });
});
