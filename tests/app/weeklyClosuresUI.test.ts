import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Fase 7.6A: verificacion por inspeccion de codigo fuente (sin jsdom/RTL en
 * este proyecto, mismo patron que tests/app/customerBanlistUI.test.ts) de
 * la integracion del panel de cierres semanales dentro de /admin/reportes
 * (AdminDashboard.tsx) como una pestaña mas, sin modulo aislado.
 */
const dashboardSource = readFileSync("components/admin/AdminDashboard.tsx", "utf8");
const typesSource = readFileSync("components/admin/dashboard/admin-dashboard.types.ts", "utf8");
const panelSource = readFileSync("components/admin/dashboard/WeeklyClosuresPanel.tsx", "utf8");

describe("Fase 7.6A: pestaña 'Cierres' integrada en /admin/reportes (sin modulo aislado)", () => {
  it("ReportTab incluye 'cierres'", () => {
    expect(typesSource).toMatch(/export type ReportTab = "resumen" \| "rentabilidad" \| "cierres"/);
  });

  it("el SegmentedControl de Reportes agrega la opcion 'Cierres'", () => {
    expect(dashboardSource).toMatch(/\{ value: "cierres", label: "Cierres" \}/);
  });

  it("view === \"reportes\" renderiza WeeklyClosuresPanel cuando reportTab === 'cierres'", () => {
    expect(dashboardSource).toMatch(/reportTab === "cierres" \? \(\s*<WeeklyClosuresPanel \/>/);
  });

  it("importa WeeklyClosuresPanel desde components/admin/dashboard", () => {
    expect(dashboardSource).toMatch(
      /import \{ WeeklyClosuresPanel \} from "@\/components\/admin\/dashboard\/WeeklyClosuresPanel"/
    );
  });

  it("no crea una pagina ni un panel administrativo aislado para cierres", () => {
    expect(existsSync("app/admin/cierres")).toBe(false);
    expect(existsSync("app/admin/cierres-semanales")).toBe(false);
  });
});

describe("Fase 7.6A: WeeklyClosuresPanel - cerrar semana con vista previa obligatoria", () => {
  it("llama a /api/admin/weekly-closures/preview antes de poder confirmar el cierre", () => {
    expect(panelSource).toMatch(/fetch\("\/api\/admin\/weekly-closures\/preview"/);
    expect(panelSource).toMatch(/method: "POST"/);
  });

  it("el boton 'Confirmar cierre' solo aparece cuando ya existe una vista previa (preview no nulo)", () => {
    const confirmBlock = panelSource.match(/\{preview \? \([\s\S]*?Confirmar cierre[\s\S]*?\)\s*: null\}/);
    expect(confirmBlock).not.toBeNull();
  });

  it("cerrar la semana llama a POST /api/admin/weekly-closures", () => {
    expect(panelSource).toMatch(/fetch\("\/api\/admin\/weekly-closures", \{\s*method: "POST"/);
  });
});

describe("Fase 7.6A: WeeklyClosuresPanel - historial con badge, detalle, export y reapertura", () => {
  it("muestra un badge distinto para CLOSED ('Activo') y REOPENED ('Reabierto')", () => {
    expect(panelSource).toMatch(/closure\.status === "CLOSED" \? "pedido" : "warning"/);
    expect(panelSource).toMatch(/closure\.status === "CLOSED" \? "Activo" : "Reabierto"/);
  });

  it("cada cierre ofrece 'Ver detalle', 'Exportar CSV' y, si esta activo, 'Reabrir'", () => {
    expect(panelSource).toMatch(/Ver detalle/);
    expect(panelSource).toMatch(/Exportar CSV/);
    expect(panelSource).toMatch(/Reabrir/);
    expect(panelSource).toMatch(/href=\{`\/api\/admin\/weekly-closures\/\$\{closure\.id\}\/export`\}/);
  });

  it("el modal de reapertura exige un motivo entre 5 y 500 caracteres antes de habilitar el boton", () => {
    expect(panelSource).toMatch(/MOTIVO_REAPERTURA_MIN_LENGTH = 5/);
    expect(panelSource).toMatch(/MOTIVO_REAPERTURA_MAX_LENGTH = 500/);
    expect(panelSource).toMatch(/disabled=\{reopenSubmitting \|\| !canSubmitReopen\}/);
  });

  it("la reapertura llama a PATCH con action: 'reopen'", () => {
    expect(panelSource).toMatch(/method: "PATCH"/);
    expect(panelSource).toMatch(/action: "reopen", reason: reopenReason/);
  });

  it("nunca muestra el motivo de reapertura completo en el historial, solo en el detalle explicito", () => {
    const historyArticleMatch = panelSource.match(/\{closures\.map\(\(closure\) => \([\s\S]*?\)\)\}/);
    expect(historyArticleMatch?.[0]).not.toMatch(/reopenReason/);
  });
});

describe("Fase 7.6A: SegmentedControl soporta 3 opciones (dinamico, no hardcodeado a 2)", () => {
  it("DashboardPresentation calcula las columnas del grid segun options.length", () => {
    const presentationSource = readFileSync("components/admin/dashboard/DashboardPresentation.tsx", "utf8");
    expect(presentationSource).toMatch(/options\.length >= 3 \? "grid-cols-3"/);
  });
});
