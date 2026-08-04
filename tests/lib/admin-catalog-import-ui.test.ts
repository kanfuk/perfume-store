import { describe, expect, it } from "vitest";
import { clearUnresolvedDecisions, buildUnresolvedBlockersMessage } from "@/lib/admin-catalog-import-ui.ts";
import type { QualityDecision, QualityFinding } from "@/lib/catalog-import/quality-review.ts";

/**
 * Regresion: al confirmar la importacion, el servidor revalida las
 * decisiones desde cero (final-plan/confirm) y puede rechazar un hallazgo
 * que el cliente consideraba "resuelto" (ej. EXACT_DUPLICATE con "mantener
 * separadas" pero sin un nombre final distinto). Antes de este fix, el
 * hallazgo seguia marcado como resuelto en el estado local (escondido en la
 * pestaña "Resueltos"), y el admin solo veia un error generico sin poder
 * ubicar que producto arreglar: un callejon sin salida.
 *
 * Estas pruebas no implementan un segundo sistema de revision: verifican el
 * contrato que consume CatalogQualityReview (existente, sin tocar) --
 * `pendingFindings` ahi se calcula como `severity !== "INFO" && !decisions[id]`,
 * y `finding.options` (las acciones reales: excluir/editar/confirmar
 * coincidencia) nunca se tocan, solo el mapa de decisiones.
 */

function buildExactDuplicateFinding(id: string, rowNumbers: [number, number]): QualityFinding {
  const [a, b] = rowNumbers;
  return {
    id,
    type: "EXACT_DUPLICATE",
    severity: "BLOCKER",
    rowNumbers,
    explanation: `Filas ${a} y ${b} representan exactamente el mismo producto (misma marca, nombre y contenido).`,
    rows: [
      { rowNumber: a, marca: "Carolina Herrera", nombre: "212 Heroes", contenido: "100ML", costo: 20000 },
      { rowNumber: b, marca: "Carolina Herrera", nombre: "212 Heroes", contenido: "100ML", costo: 20000 }
    ],
    options: [
      { id: "KEEP_FIRST", label: `Conservar fila ${a}` },
      { id: "KEEP_SECOND", label: `Conservar fila ${b}` },
      { id: "EXCLUDE_FIRST", label: `Excluir fila ${a} de esta importación` },
      { id: "EXCLUDE_SECOND", label: `Excluir fila ${b} de esta importación` },
      { id: "KEEP_SEPARATE", label: "Mantener separadas (indicar nombres finales distintos)" }
    ]
  };
}

function buildExistingCatalogMatchFinding(id: string, rowNumber: number): QualityFinding {
  return {
    id,
    type: "EXISTING_CATALOG_MATCH",
    severity: "WARNING",
    rowNumbers: [rowNumber],
    existingProductId: "producto-existente-1",
    explanation: `La fila ${rowNumber} se parece a un producto existente ("Sauvage", SKU DIOR-SAU-100ML). ¿Es el mismo producto?`,
    rows: [{ rowNumber, marca: "Dior", nombre: "Sauvage EDT", contenido: "100ML", costo: 30000 }],
    options: [
      { id: "UPDATE_EXISTING", label: "Actualizar este producto existente" },
      { id: "CREATE_SEPARATE", label: "Crear como producto separado" },
      { id: "EDIT_NAME", label: "Editar nombre/contenido" },
      { id: "EXCLUDE_FIRST", label: `Excluir fila ${rowNumber} de esta importación` }
    ]
  };
}

describe("clearUnresolvedDecisions", () => {
  it("quita del mapa de decisiones los hallazgos que el servidor sigue considerando bloqueantes", () => {
    const decisions = {
      "EXACT_DUPLICATE:2|3": { findingId: "EXACT_DUPLICATE:2|3", optionId: "KEEP_SEPARATE" },
      "MISSING_BRAND:5": { findingId: "MISSING_BRAND:5", optionId: "EXCLUDE_FIRST" }
    };

    const next = clearUnresolvedDecisions(decisions, ["EXACT_DUPLICATE:2|3"]);

    expect(next).not.toHaveProperty("EXACT_DUPLICATE:2|3");
    expect(next).toHaveProperty("MISSING_BRAND:5");
  });

  it("no modifica el mapa original (inmutable)", () => {
    const decisions = { "A:1": { findingId: "A:1", optionId: "IGNORE_WARNING" } };
    const next = clearUnresolvedDecisions(decisions, ["A:1"]);

    expect(decisions).toHaveProperty("A:1");
    expect(next).not.toHaveProperty("A:1");
    expect(next).not.toBe(decisions);
  });

  it("ignora ids que no estan en el mapa (no revienta)", () => {
    const decisions = { "A:1": { findingId: "A:1", optionId: "IGNORE_WARNING" } };
    const next = clearUnresolvedDecisions(decisions, ["B:2", "C:3"]);

    expect(next).toEqual(decisions);
  });

  it("con una lista vacia devuelve una copia identica", () => {
    const decisions = { "A:1": { findingId: "A:1", optionId: "IGNORE_WARNING" } };
    expect(clearUnresolvedDecisions(decisions, [])).toEqual(decisions);
  });
});

describe("buildUnresolvedBlockersMessage", () => {
  it("identifica el producto (por nombre de fila) y la razon (la explicacion del hallazgo)", () => {
    const finding = buildExactDuplicateFinding("EXACT_DUPLICATE:2|3", [2, 3]);
    const message = buildUnresolvedBlockersMessage([finding]);

    expect(message).toContain("212 Heroes");
    expect(message).toContain(finding.explanation);
    expect(message).toContain("Pendientes");
  });

  it("si la fila no tiene nombre, identifica por numero de fila", () => {
    const finding: QualityFinding = {
      id: "MISSING_NAME:7",
      type: "MISSING_NAME",
      severity: "BLOCKER",
      rowNumbers: [7],
      explanation: "La fila 7 no tiene nombre de perfume.",
      rows: [{ rowNumber: 7, marca: "", nombre: "", contenido: "", costo: 0 }],
      options: [
        { id: "EDIT_NAME", label: "Escribir nombre" },
        { id: "EXCLUDE_FIRST", label: "Excluir fila 7 de esta importación" }
      ]
    };

    const message = buildUnresolvedBlockersMessage([finding]);
    expect(message).toContain("fila 7");
  });

  it("con varios blockers, menciona cuantos mas quedan ademas del primero", () => {
    const findings = [
      buildExactDuplicateFinding("EXACT_DUPLICATE:2|3", [2, 3]),
      buildExactDuplicateFinding("EXACT_DUPLICATE:9|10", [9, 10])
    ];

    const message = buildUnresolvedBlockersMessage(findings);
    expect(message).toContain("1 conflicto(s) más");
  });

  it("con una lista vacia devuelve un mensaje vacio (no revienta)", () => {
    expect(buildUnresolvedBlockersMessage([])).toBe("");
  });
});

describe("Escenario completo: un blocker reabierto", () => {
  it("el hallazgo vuelve a cumplir la condicion de 'Pendientes' de CatalogQualityReview y conserva sus acciones reales", () => {
    const finding = buildExactDuplicateFinding("EXACT_DUPLICATE:2|3", [2, 3]);
    const decisions: Record<string, QualityDecision> = {
      "EXACT_DUPLICATE:2|3": { findingId: "EXACT_DUPLICATE:2|3", optionId: "KEEP_SEPARATE" }
    };

    const next = clearUnresolvedDecisions(decisions, [finding.id]);

    // CatalogQualityReview calcula "pendiente" como severity !== "INFO" && !decisions[id].
    const isPending = finding.severity !== "INFO" && !next[finding.id];
    expect(isPending).toBe(true);

    // Las acciones reales del hallazgo (excluir, mantener separado, conservar
    // una u otra fila) nunca se tocan: solo se limpio el mapa de decisiones.
    expect(finding.options.map((o) => o.id)).toEqual([
      "KEEP_FIRST",
      "KEEP_SECOND",
      "EXCLUDE_FIRST",
      "EXCLUDE_SECOND",
      "KEEP_SEPARATE"
    ]);
  });

  it("permite guardar una nueva decision para el hallazgo reabierto (misma mecanica que CatalogQualityReview.applyDecision)", () => {
    const finding = buildExactDuplicateFinding("EXACT_DUPLICATE:2|3", [2, 3]);
    const decisions: Record<string, QualityDecision> = {
      "EXACT_DUPLICATE:2|3": { findingId: "EXACT_DUPLICATE:2|3", optionId: "KEEP_SEPARATE" }
    };
    const afterClear = clearUnresolvedDecisions(decisions, [finding.id]);

    const newDecision: QualityDecision = {
      findingId: finding.id,
      optionId: "EXCLUDE_SECOND"
    };
    const afterNewDecision = { ...afterClear, [finding.id]: newDecision };

    expect(afterNewDecision[finding.id]).toEqual(newDecision);
  });
});

describe("Escenario completo: varios blockers reabiertos, decisiones ajenas preservadas", () => {
  it("limpia solo los hallazgos indicados por el servidor; el resto conserva su decision", () => {
    const reopened = [
      buildExactDuplicateFinding("EXACT_DUPLICATE:2|3", [2, 3]),
      buildExistingCatalogMatchFinding("EXISTING_CATALOG_MATCH:9", 9)
    ];
    const decisions: Record<string, QualityDecision> = {
      "EXACT_DUPLICATE:2|3": { findingId: "EXACT_DUPLICATE:2|3", optionId: "KEEP_SEPARATE" },
      "EXISTING_CATALOG_MATCH:9": { findingId: "EXISTING_CATALOG_MATCH:9", optionId: "UPDATE_EXISTING" },
      "MISSING_BRAND:5": { findingId: "MISSING_BRAND:5", optionId: "EXCLUDE_FIRST" },
      "PRICE_ANOMALY:11": { findingId: "PRICE_ANOMALY:11", optionId: "ACCEPT_NEW_COST" }
    };

    const next = clearUnresolvedDecisions(
      decisions,
      reopened.map((f) => f.id)
    );

    expect(next).not.toHaveProperty("EXACT_DUPLICATE:2|3");
    expect(next).not.toHaveProperty("EXISTING_CATALOG_MATCH:9");
    // Decisiones que el servidor SI acepto: intactas, sin perder la eleccion del admin.
    expect(next["MISSING_BRAND:5"]).toEqual(decisions["MISSING_BRAND:5"]);
    expect(next["PRICE_ANOMALY:11"]).toEqual(decisions["PRICE_ANOMALY:11"]);

    const message = buildUnresolvedBlockersMessage(reopened);
    expect(message).toContain("1 conflicto(s) más");
  });
});
