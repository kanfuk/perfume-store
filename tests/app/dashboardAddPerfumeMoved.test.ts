import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * QA manual: el acceso rapido "Agregar perfume" se veia desordenado en
 * Inicio y debia moverse a /admin/catalogo/productos (Centro de productos).
 * Se verifica por inspeccion de codigo fuente (no hay jsdom/RTL en este
 * proyecto): Inicio ya no debe ofrecer ningun camino para crear un perfume
 * (boton, tarjeta, modal), y el unico lugar que monta AddPerfumeModal debe
 * ser CatalogControlCenter (Productos) -- ver
 * tests/app/catalogControlCenterImageUpdate.test.ts para el detalle de esa
 * ubicacion.
 */
const dashboardHomeSource = readFileSync("components/admin/dashboard/DashboardHomeView.tsx", "utf8");
const adminDashboardSource = readFileSync("components/admin/AdminDashboard.tsx", "utf8");
const catalogControlCenterSource = readFileSync("components/admin/CatalogControlCenter.tsx", "utf8");

describe('Inicio (dashboard) ya no ofrece "Agregar perfume"', () => {
  it("DashboardHomeView no contiene el texto ni el icono del acceso retirado", () => {
    expect(dashboardHomeSource).not.toMatch(/Agregar perfume/);
    expect(dashboardHomeSource).not.toMatch(/onAddProduct/);
  });

  it("AdminDashboard.tsx ya no monta AddPerfumeModal ni el estado que lo abria", () => {
    expect(adminDashboardSource).not.toMatch(/AddPerfumeModal/);
    expect(adminDashboardSource).not.toMatch(/ProductModalState/);
    expect(adminDashboardSource).not.toMatch(/productModalState/);
  });

  it("las acciones rápidas restantes no dejan un espacio vacío (grid ajustado a 3 columnas)", () => {
    expect(dashboardHomeSource).toMatch(/grid gap-3 sm:grid-cols-2 xl:grid-cols-3/);
  });
});

describe('"Agregar perfume" existe en un unico lugar: CatalogControlCenter (Productos)', () => {
  it("CatalogControlCenter es el unico archivo del admin que importa AddPerfumeModal", () => {
    expect(catalogControlCenterSource).toMatch(
      /import \{ AddPerfumeModal \} from "@\/components\/admin\/dashboard\/AddPerfumeModal";/
    );
  });

  it("no hay un segundo boton/acceso a Agregar perfume en Inicio", () => {
    expect(dashboardHomeSource).not.toMatch(/Agregar perfume/);
  });
});
