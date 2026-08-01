import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("image review reconciliation report", () => {
  const report = readFileSync("docs/SMELLME_IMAGE_REVIEW_RECONCILIATION.md", "utf8");
  const rows = report.split("\n").filter((line) => /^\| [0-9a-f]{8} \|/.test(line));

  it("documents exactly 39 grouped cases", () => {
    expect(rows).toHaveLength(39);
    for (const category of ["B", "C", "D", "E", "F", "G"]) {
      expect(rows.some((row) => row.includes(`| ${category} |`))).toBe(true);
    }
  });

  it("explains the reproducible difference of 11", () => {
    expect(rows.filter((row) => row.includes("| G |"))).toHaveLength(11);
    expect(report).toContain("28 casos de núcleo comercial + 11 falsos positivos técnicos = 39 observados");
    expect(report).toContain("no una lista histórica congelada");
  });

  it("contains no forbidden commercial or personal fields", () => {
    expect(report).not.toMatch(/costo unitario|precio compra|stock actual|correo electrónico|teléfono|número de cuenta/i);
  });
});
