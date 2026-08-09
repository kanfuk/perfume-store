import { describe, expect, it } from "vitest";
import {
  buildWeeklyClosureCsv,
  buildWeeklyClosureCsvFilename,
  escapeCsvValue,
  type WeeklyClosureCsvInput
} from "@/lib/weekly-closures/csv";

function baseInput(overrides: Partial<WeeklyClosureCsvInput> = {}): WeeklyClosureCsvInput {
  return {
    id: "cierre-1",
    periodStart: "2026-08-03T04:00:00.000Z",
    periodEndExclusive: "2026-08-10T04:00:00.000Z",
    version: 1,
    status: "CLOSED",
    ordersCount: 5,
    cancelledOrdersCount: 1,
    pendingOrdersCount: 2,
    deliveredOrdersCount: 2,
    directSalesCount: 1,
    grossSales: 100000,
    incomeAmount: 80000,
    costAmount: 40000,
    profitAmount: 60000,
    outstandingAmount: 20000,
    closedAt: "2026-08-10T04:05:00.000Z",
    closedByEmail: "admin@smellme.cl",
    reopenedAt: null,
    hasReopenReason: false,
    ...overrides
  };
}

describe("escapeCsvValue - proteccion contra CSV injection", () => {
  it("antepone un apostrofe a valores que empiezan con =, +, - o @", () => {
    expect(escapeCsvValue("=cmd")).toBe("'=cmd");
    expect(escapeCsvValue("+1234")).toBe("'+1234");
    expect(escapeCsvValue("-1234")).toBe("'-1234");
    expect(escapeCsvValue("@SUM(A1)")).toBe("'@SUM(A1)");
  });

  it("no modifica un valor seguro", () => {
    expect(escapeCsvValue("admin@smellme.cl")).toBe("admin@smellme.cl");
    expect(escapeCsvValue("CLOSED")).toBe("CLOSED");
  });

  it("envuelve en comillas dobles cuando el valor contiene coma, comilla o salto de linea", () => {
    expect(escapeCsvValue("a,b")).toBe('"a,b"');
    expect(escapeCsvValue('a"b')).toBe('"a""b"');
    expect(escapeCsvValue("a\nb")).toBe('"a\nb"');
  });
});

describe("buildWeeklyClosureCsv", () => {
  it("genera un CSV clave,valor con las 19 filas esperadas y encabezado campo,valor", () => {
    const csv = buildWeeklyClosureCsv(baseInput());
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("campo,valor");
    expect(lines).toHaveLength(20);
    expect(csv).toContain("ID de cierre,cierre-1");
    expect(csv).toContain("Version,1");
    expect(csv).toContain("Ventas,100000");
    expect(csv).toContain("Utilidad,60000");
  });

  it("nunca exporta el motivo de reapertura completo -- solo un indicador booleano", () => {
    const csv = buildWeeklyClosureCsv(
      baseInput({
        status: "REOPENED",
        reopenedAt: "2026-08-11T00:00:00.000Z",
        hasReopenReason: true
      })
    );
    expect(csv).toContain("Tiene motivo de reapertura,si");
    expect(csv.toLowerCase()).not.toContain("se detecto");
  });

  it("hasReopenReason=false exporta 'no'", () => {
    const csv = buildWeeklyClosureCsv(baseInput({ hasReopenReason: false }));
    expect(csv).toContain("Tiene motivo de reapertura,no");
  });

  it("neutraliza un nombre de administrador que empiece con un caracter de formula", () => {
    const csv = buildWeeklyClosureCsv(baseInput({ closedByEmail: "=HYPERLINK(\"http://evil\")" }));
    expect(csv).toContain("'=HYPERLINK");
  });
});

describe("buildWeeklyClosureCsvFilename", () => {
  it("construye el nombre esperado con la fecha del periodo y la version", () => {
    expect(buildWeeklyClosureCsvFilename("2026-08-03", 1)).toBe("smellme-cierre-semanal-2026-08-03-v1.csv");
    expect(buildWeeklyClosureCsvFilename("2026-08-03", 2)).toBe("smellme-cierre-semanal-2026-08-03-v2.csv");
  });
});
