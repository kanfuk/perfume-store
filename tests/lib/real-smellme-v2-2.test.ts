import { describe, expect, it } from "vitest";
import { buildAuthorizedSmellmeV22Decisions } from "@/lib/catalog-import/real-smellme-v2-2";
import type { QualityReviewResult } from "@/lib/catalog-import/quality-review";

function reviewWith(blockers: Array<{ id: string; rows: number[]; type?: string }>): QualityReviewResult {
  return {
    findings: blockers.map((blocker) => ({
      id: blocker.id,
      type: blocker.type ?? "EXACT_DUPLICATE",
      severity: "BLOCKER",
      rowNumbers: blocker.rows,
      explanation: "Duplicado",
      rows: [],
      options: []
    })) as unknown as QualityReviewResult["findings"],
    summary: {
      filasFisicas: 159,
      filasVacias: 10,
      filasUtiles: 149,
      normalizacionesSeguras: 0,
      variantesDetectadas: 19,
      posiblesDuplicados: blockers.length,
      coincidenciasCatalogoExistente: 0,
      incoherenciasNombreOMarca: 0,
      advertenciasCosto: 0,
      datosIncompletos: 0,
      conflictosPendientes: blockers.length
    },
    normalizedRows: []
  };
}

describe("decisiones autorizadas del catálogo real V2.2", () => {
  it("conserva solo fila 97 y fila 106 en los dos conflictos revisados", () => {
    expect(buildAuthorizedSmellmeV22Decisions(reviewWith([
      { id: "one-million", rows: [75, 97] },
      { id: "toy-boy", rows: [106, 114] }
    ]))).toEqual([
      { findingId: "one-million", optionId: "KEEP_SECOND" },
      { findingId: "toy-boy", optionId: "KEEP_FIRST" }
    ]);
  });

  it("detiene cualquier tercer blocker o pareja distinta", () => {
    expect(() => buildAuthorizedSmellmeV22Decisions(reviewWith([
      { id: "one", rows: [75, 97] }, { id: "toy", rows: [106, 114] }, { id: "new", rows: [1, 2] }
    ]))).toThrow(/exactamente 2 blockers/);
    expect(() => buildAuthorizedSmellmeV22Decisions(reviewWith([
      { id: "one", rows: [75, 97] }, { id: "unknown", rows: [8, 9] }
    ]))).toThrow(/no autorizado/);
  });

  it("detiene si las estadísticas físicas cambian", () => {
    const review = reviewWith([{ id: "one", rows: [75, 97] }, { id: "toy", rows: [106, 114] }]);
    review.summary.filasUtiles = 148;
    expect(() => buildAuthorizedSmellmeV22Decisions(review)).toThrow(/CSV inesperado/);
  });
});
