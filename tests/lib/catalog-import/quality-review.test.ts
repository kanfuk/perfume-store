import { describe, expect, it } from "vitest";
import { parseSupplierCsv } from "@/lib/catalog-import/supplier-import.ts";
import {
  runQualityReview,
  applyQualityDecisions,
  normalizeCasingSafe,
  buildNormalizedRow,
  nameSimilarity,
  buildCandidateNameKey,
  type ExistingProductForReview,
  type QualityDecision
} from "@/lib/catalog-import/quality-review.ts";
import type { SupplierImportRow } from "@/lib/catalog-import/supplier-import.ts";

const HEADER = "Perfume;Marca;Contenido;Precio Compra";

function csv(...rows: string[]): Buffer {
  return Buffer.from([HEADER, ...rows].join("\n"), "utf8");
}

function parseRows(...rows: string[]): SupplierImportRow[] {
  return parseSupplierCsv(csv(...rows)).rows;
}

function review(rows: SupplierImportRow[], existing: ExistingProductForReview[] = []) {
  return runQualityReview(rows, existing, { filasFisicas: rows.length, filasVacias: 0 });
}

function existingProduct(overrides: Partial<ExistingProductForReview> = {}): ExistingProductForReview {
  return {
    productId: "prod-1",
    sku: "SML-MARCA-NOMBRE-50ML",
    marca: "Marca",
    nombre: "Nombre",
    contenido: "50ML",
    costoUnitario: 10000,
    precioVenta: 13500,
    modoPrecio: "AUTO",
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// NORMALIZACION
// ---------------------------------------------------------------------------

describe("quality-review - normalizacion segura", () => {
  it("normaliza contenido '100 ml'/'100ml'/'100 ML'/'100 Ml' a '100ML'", () => {
    for (const variant of ["100 ml", "100ml", "100 ML", "100 Ml"]) {
      const rows = parseRows(`Nombre;Marca;${variant};10000`);
      const normalized = buildNormalizedRow(rows[0]);
      expect(normalized.contenido).toBe("100ML");
    }
  });

  it("preserva siglas conocidas (EDP, EDT, VIP, NYC, 212, MYSLF) al normalizar capitalizacion", () => {
    expect(normalizeCasingSafe("212 vip mujer").value).toBe("212 VIP Mujer");
    expect(normalizeCasingSafe("hugo boss bottled edt").value).toBe("Hugo Boss Bottled EDT");
    expect(normalizeCasingSafe("myslf eau de parfum").value).toContain("MYSLF");
    expect(normalizeCasingSafe("212 nyc").value).toBe("212 NYC");
  });

  it("conserva el valor original para auditoria (no se pierde el texto crudo)", () => {
    const rows = parseRows("carolina herrera good girl;Carolina herrera;80 ml;10000");
    const normalized = buildNormalizedRow(rows[0]);
    expect(normalized.originalMarca).toBe("Carolina herrera");
    expect(normalized.originalContenido).toBe("80 ml");
    expect(normalized.marca).toBe("Carolina Herrera");
  });

  it("NO corrige ortografia comercial: 'Necrar' permanece igual", () => {
    const rows = parseRows("My way Necrar;Giorgio Armani;90ml;57000");
    const normalized = buildNormalizedRow(rows[0]);
    expect(normalized.nombre).toBe("My Way Necrar");
  });

  it("detecta la normalizacion de capitalizacion de marca como SAFE_NORMALIZATION (INFO)", () => {
    const rows = parseRows("Good Girl;Carolina herrera;80ml;53000");
    const result = review(rows);
    const finding = result.findings.find((f) => f.type === "SAFE_NORMALIZATION");
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe("INFO");
    expect(finding!.original?.marca).toBe("Carolina herrera");
    expect(finding!.suggested?.marca).toBe("Carolina Herrera");
  });

  it("Unicode: conserva tildes y normaliza a NFC", () => {
    const rows = parseRows("Léau Dissey;Issey Miyake;125ml;42000");
    const normalized = buildNormalizedRow(rows[0]);
    expect(normalized.nombre.normalize("NFC")).toBe(normalized.nombre);
  });
});

// ---------------------------------------------------------------------------
// DUPLICADOS
// ---------------------------------------------------------------------------

describe("quality-review - duplicado exacto", () => {
  it("detecta duplicado exacto con el mismo costo (BLOCKER)", () => {
    const rows = parseRows(
      "La Bomba;Carolina Herrera;80ML;58000",
      "La Bomba;Carolina Herrera;80ML;58000"
    );
    const result = review(rows);
    const finding = result.findings.find((f) => f.type === "EXACT_DUPLICATE");
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe("BLOCKER");
    expect(finding!.rowNumbers).toEqual([2, 3]);
  });

  it("detecta duplicado exacto con costos diferentes y expone ambos costos", () => {
    const rows = parseRows(
      "La Bomba;Carolina Herrera;80ML;58000",
      "La Bomba;Carolina Herrera;80ML;62000"
    );
    const result = review(rows);
    const finding = result.findings.find((f) => f.type === "EXACT_DUPLICATE")!;
    expect(finding.severity).toBe("BLOCKER");
    expect(finding.explanation).toMatch(/\$58\.000/);
    expect(finding.explanation).toMatch(/\$62\.000/);
  });

  it("un BLOCKER sin decision impide construir el plan final", () => {
    const rows = parseRows(
      "La Bomba;Carolina Herrera;80ML;58000",
      "La Bomba;Carolina Herrera;80ML;58000"
    );
    const result = review(rows);
    const applied = applyQualityDecisions(rows, result.findings, [], [], 35);
    expect(applied.plan).toHaveLength(0);
    expect(applied.unresolvedBlockers.length).toBeGreaterThan(0);
  });

  it("KEEP_FIRST excluye la segunda fila y deja un solo SKU final", () => {
    const rows = parseRows(
      "La Bomba;Carolina Herrera;80ML;58000",
      "La Bomba;Carolina Herrera;80ML;62000"
    );
    const result = review(rows);
    const finding = result.findings.find((f) => f.type === "EXACT_DUPLICATE")!;
    const decisions: QualityDecision[] = [{ findingId: finding.id, optionId: "KEEP_FIRST" }];
    const applied = applyQualityDecisions(rows, result.findings, decisions, [], 35);
    expect(applied.unresolvedBlockers).toHaveLength(0);
    expect(applied.plan).toHaveLength(1);
    expect(applied.plan[0].costoUnitario).toBe(58000);
  });

  it("EXCLUDE_SECOND excluye la fila indicada explicitamente", () => {
    const rows = parseRows(
      "La Bomba;Carolina Herrera;80ML;58000",
      "La Bomba;Carolina Herrera;80ML;62000"
    );
    const result = review(rows);
    const finding = result.findings.find((f) => f.type === "EXACT_DUPLICATE")!;
    const decisions: QualityDecision[] = [{ findingId: finding.id, optionId: "EXCLUDE_SECOND" }];
    const applied = applyQualityDecisions(rows, result.findings, decisions, [], 35);
    expect(applied.plan).toHaveLength(1);
    expect(applied.plan[0].costoUnitario).toBe(58000);
  });

  it("KEEP_SEPARATE con nombre final editado para la segunda fila resuelve el conflicto", () => {
    const rows = parseRows(
      "La Bomba;Carolina Herrera;80ML;58000",
      "La Bomba;Carolina Herrera;80ML;62000"
    );
    const result = review(rows);
    const finding = result.findings.find((f) => f.type === "EXACT_DUPLICATE")!;
    const decisions: QualityDecision[] = [
      { findingId: finding.id, optionId: "KEEP_SEPARATE", textValue: "La Bomba Edición 2" }
    ];
    const applied = applyQualityDecisions(rows, result.findings, decisions, [], 35);
    expect(applied.unresolvedBlockers).toHaveLength(0);
    expect(applied.plan).toHaveLength(2);
    expect(applied.plan.map((p) => p.nombre).sort()).toEqual(["La Bomba", "La Bomba Edición 2"]);
  });

  it("KEEP_SEPARATE sin editar nombres vuelve a quedar como conflicto no resuelto", () => {
    const rows = parseRows(
      "La Bomba;Carolina Herrera;80ML;58000",
      "La Bomba;Carolina Herrera;80ML;62000"
    );
    const result = review(rows);
    const finding = result.findings.find((f) => f.type === "EXACT_DUPLICATE")!;
    const decisions: QualityDecision[] = [{ findingId: finding.id, optionId: "KEEP_SEPARATE" }];
    const applied = applyQualityDecisions(rows, result.findings, decisions, [], 35);
    expect(applied.unresolvedBlockers.length).toBeGreaterThan(0);
    expect(applied.errors.join(" ")).toMatch(/nombres finales siguen siendo idénticos/);
  });
});

describe("quality-review - posible duplicado", () => {
  it("caso obligatorio: Versace Brigth crystal / Bright Crystal EDT (misma marca y contenido)", () => {
    const rows = parseRows(
      "Versace Brigth crystal;Versace;50ML;42000",
      "Bright Crystal EDT;Versace;50ML;36000"
    );
    const result = review(rows);
    const finding = result.findings.find((f) => f.type === "POSSIBLE_DUPLICATE");
    expect(finding).toBeDefined();
    expect(finding!.severity).not.toBe("BLOCKER");
    expect(finding!.options.map((o) => o.id)).toEqual(
      expect.arrayContaining([
        "UNIFY_UNDER_FIRST",
        "UNIFY_UNDER_SECOND",
        "SET_CANONICAL_NAME",
        "KEEP_SEPARATE",
        "IGNORE_WARNING"
      ])
    );
  });

  it("nunca fusiona automaticamente: sin decision, ambas filas sobreviven separadas", () => {
    const rows = parseRows(
      "Versace Brigth crystal;Versace;50ML;42000",
      "Bright Crystal EDT;Versace;50ML;36000"
    );
    const result = review(rows);
    const applied = applyQualityDecisions(rows, result.findings, [], [], 35);
    expect(applied.plan).toHaveLength(2);
  });

  it("unificar exige elegir explicitamente el costo a conservar (no promedia)", () => {
    const rows = parseRows(
      "Versace Brigth crystal;Versace;50ML;42000",
      "Bright Crystal EDT;Versace;50ML;36000"
    );
    const result = review(rows);
    const finding = result.findings.find((f) => f.type === "POSSIBLE_DUPLICATE")!;

    const withoutCost: QualityDecision[] = [{ findingId: finding.id, optionId: "UNIFY_UNDER_FIRST" }];
    const failed = applyQualityDecisions(rows, result.findings, withoutCost, [], 35);
    expect(failed.unresolvedBlockers.length).toBeGreaterThan(0);

    const withCost: QualityDecision[] = [
      { findingId: finding.id, optionId: "UNIFY_UNDER_FIRST", costFromRow: finding.rowNumbers[1] }
    ];
    const applied = applyQualityDecisions(rows, result.findings, withCost, [], 35);
    expect(applied.unresolvedBlockers).toHaveLength(0);
    expect(applied.plan).toHaveLength(1);
    expect(applied.plan[0].costoUnitario).toBe(36000);
    expect(applied.plan[0].nombre).toBe("Versace Brigth Crystal");
  });

  it("SET_CANONICAL_NAME permite escribir un nombre final propio", () => {
    const rows = parseRows(
      "Versace Brigth crystal;Versace;50ML;42000",
      "Bright Crystal EDT;Versace;50ML;36000"
    );
    const result = review(rows);
    const finding = result.findings.find((f) => f.type === "POSSIBLE_DUPLICATE")!;
    const decisions: QualityDecision[] = [
      {
        findingId: finding.id,
        optionId: "SET_CANONICAL_NAME",
        textValue: "Bright Crystal",
        costFromRow: finding.rowNumbers[0]
      }
    ];
    const applied = applyQualityDecisions(rows, result.findings, decisions, [], 35);
    expect(applied.plan).toHaveLength(1);
    expect(applied.plan[0].nombre).toBe("Bright Crystal");
    expect(applied.plan[0].costoUnitario).toBe(42000);
  });

  it("familia Aqua di Gio Profondo: se agrupan para comparacion pero NUNCA se fusionan automaticamente", () => {
    const rows = parseRows(
      "Aqua di gio Profondo Parfum;Giorgio Armani;125ml;65000",
      "Aqua di gio Profondo Eau de parfum;Giorgio Armani;125ml;62000",
      "Aqua di gio Profondo;Giorgio Armani;125ml;52000",
      "Aqua di gio parfum;Giorgio Armani;125ml;55000"
    );
    const result = review(rows);
    const possibleDuplicates = result.findings.filter(
      (f) => f.type === "POSSIBLE_DUPLICATE" || f.type === "NAME_INCONSISTENCY"
    );
    expect(possibleDuplicates.length).toBeGreaterThan(0);
    // Ninguna diferencia de concentracion (EDT/Parfum/Eau de Parfum) fuerza BLOCKER.
    expect(possibleDuplicates.every((f) => f.severity !== "BLOCKER")).toBe(true);

    const applied = applyQualityDecisions(rows, result.findings, [], [], 35);
    expect(applied.plan).toHaveLength(4); // conservados por separado, 0 fusiones automaticas
  });

  it("EDT/EDP/Parfum/Elixir nunca fuerzan un BLOCKER automatico por si solos", () => {
    const rows = parseRows("Sauvage EDT;Dior;100ml;40000", "Sauvage Elixir;Dior;100ml;45000");
    const result = review(rows);
    const finding = result.findings.find((f) => f.type === "POSSIBLE_DUPLICATE")!;
    expect(finding.severity).toBe("WARNING");
  });
});

describe("quality-review - similitud media (NAME_INCONSISTENCY)", () => {
  it("nombres parecidos con similitud media quedan como NAME_INCONSISTENCY, no se autocorrigen", () => {
    const rows = parseRows("212 NYC;Carolina Herrera;100ml;55000", "212 Sexy;Carolina Herrera;100ml;55000");
    const result = review(rows);
    const finding = result.findings.find((f) => f.type === "NAME_INCONSISTENCY");
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe("WARNING");

    const applied = applyQualityDecisions(rows, result.findings, [], [], 35);
    const names = applied.plan.map((p) => p.nombre).sort();
    expect(names).toEqual(["212 NYC", "212 Sexy"]); // sin decision, nada cambia
  });

  it("detecta typo de descriptor conocido sin diccionario externo (parfm ~ parfum)", () => {
    const rows = parseRows("Myslf Eau de parfm;Yves Saint Laurent;100ml;60000");
    const result = review(rows);
    const finding = result.findings.find((f) => f.type === "NAME_INCONSISTENCY");
    expect(finding).toBeDefined();
    expect(finding!.explanation).toMatch(/posible inconsistencia/i);
  });
});

// ---------------------------------------------------------------------------
// VARIANTES
// ---------------------------------------------------------------------------

describe("quality-review - variantes por contenido", () => {
  it("caso obligatorio: Lady million 30/50/80ML genera 3 variantes, 0 duplicados", () => {
    const rows = parseRows(
      "Lady million;Paco Rabanne;30ml;25000",
      "Lady million;Paco Rabanne;50ml;35000",
      "Lady million;Paco Rabanne;80ml;50000"
    );
    const result = review(rows);
    const variant = result.findings.find((f) => f.type === "VARIANT");
    expect(variant).toBeDefined();
    expect(variant!.rowNumbers).toHaveLength(3);
    expect(variant!.severity).toBe("INFO");
    expect(result.findings.some((f) => f.type === "EXACT_DUPLICATE")).toBe(false);
    expect(result.findings.some((f) => f.type === "POSSIBLE_DUPLICATE")).toBe(false);
  });

  it("cada variante obtiene un SKU distinto y no bloquea el plan final", () => {
    const rows = parseRows(
      "Lady million;Paco Rabanne;30ml;25000",
      "Lady million;Paco Rabanne;50ml;35000",
      "Lady million;Paco Rabanne;80ml;50000"
    );
    const result = review(rows);
    const applied = applyQualityDecisions(rows, result.findings, [], [], 35);
    expect(applied.unresolvedBlockers).toHaveLength(0);
    expect(applied.plan).toHaveLength(3);
    const skus = new Set(applied.plan.map((p) => p.sku));
    expect(skus.size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// MARCAS
// ---------------------------------------------------------------------------

describe("quality-review - incoherencias de marca", () => {
  it("caso obligatorio: Yves Saint Lauren / Ives Saint Lauren -> BRAND_INCONSISTENCY con sugerencia editable", () => {
    const rows = parseRows(
      "Black opium;Yves Saint Lauren;50ml;40000",
      "Libre;Ives Saint Lauren;90ml;60000"
    );
    const result = review(rows);
    const finding = result.findings.find((f) => f.type === "BRAND_INCONSISTENCY");
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe("WARNING");
    expect(finding!.suggested?.marca).toBeDefined();
    expect(finding!.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["USE_SUGGESTED_BRAND", "USE_ALTERNATE_BRAND", "SET_BRAND_MANUAL", "KEEP_SEPARATE"])
    );
  });

  it("aplicar a todas dentro del archivo actualiza unicamente las filas de esta importacion", () => {
    const rows = parseRows(
      "Black opium;Yves Saint Lauren;50ml;40000",
      "Libre;Ives Saint Lauren;90ml;60000"
    );
    const result = review(rows);
    const finding = result.findings.find((f) => f.type === "BRAND_INCONSISTENCY")!;
    const decisions: QualityDecision[] = [
      { findingId: finding.id, optionId: "USE_SUGGESTED_BRAND", applyToAllInFile: true }
    ];
    const applied = applyQualityDecisions(rows, result.findings, decisions, [], 35);
    const brands = new Set(applied.plan.map((p) => p.marca));
    expect(brands.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// CATALOGO EXISTENTE
// ---------------------------------------------------------------------------

describe("quality-review - cotejo con catalogo existente", () => {
  it("SKU exacto: no genera un hallazgo de cotejo (es la ruta normal de ACTUALIZAR)", () => {
    const rows = parseRows("La Bomba;Carolina Herrera;80ML;58000");
    const existing = [
      existingProduct({
        sku: "SML-CAROLINA-HERRERA-LA-BOMBA-80ML",
        marca: "Carolina Herrera",
        nombre: "La Bomba",
        contenido: "80ML"
      })
    ];
    const result = review(rows, existing);
    expect(result.findings.some((f) => f.type === "EXISTING_CATALOG_MATCH")).toBe(false);
  });

  it("identidad exacta con SKU historico distinto pide cotejo explicito", () => {
    const rows = parseRows("La Bomba;Carolina Herrera;80ML;58000");
    const existing = [
      existingProduct({
        sku: "SML-VIEJO-SKU-HISTORICO",
        marca: "Carolina Herrera",
        nombre: "La Bomba",
        contenido: "80ML"
      })
    ];
    const result = review(rows, existing);
    const finding = result.findings.find((f) => f.type === "EXISTING_CATALOG_MATCH");
    expect(finding).toBeDefined();
    expect(finding!.existingProductId).toBe("prod-1");
  });

  it("candidato similar NO se selecciona automaticamente: requiere decision explicita", () => {
    const rows = parseRows("La Bomba Intense;Carolina Herrera;80ML;58000");
    const existing = [
      existingProduct({
        sku: "SML-CAROLINA-HERRERA-LA-BOMBA-80ML",
        marca: "Carolina Herrera",
        nombre: "La Bomba",
        contenido: "80ML"
      })
    ];
    const result = review(rows, existing);
    const finding = result.findings.find((f) => f.type === "EXISTING_CATALOG_MATCH");
    expect(finding).toBeDefined();

    const withoutDecision = applyQualityDecisions(rows, result.findings, [], existing, 35);
    expect(withoutDecision.plan[0].action).toBe("CREAR"); // no se ata automaticamente al existente

    const decisions: QualityDecision[] = [
      { findingId: finding!.id, optionId: "UPDATE_EXISTING", targetProductId: "prod-1" }
    ];
    const withDecision = applyQualityDecisions(rows, result.findings, decisions, existing, 35);
    expect(withDecision.plan[0].action).toBe("ACTUALIZAR");
    expect(withDecision.plan[0].sku).toBe("SML-CAROLINA-HERRERA-LA-BOMBA-80ML");
  });

  it("producto existente MANUAL conserva su precio de venta en el plan final", () => {
    const rows = parseRows("La Bomba;Carolina Herrera;80ML;58000");
    const existing = [
      existingProduct({
        sku: "SML-CAROLINA-HERRERA-LA-BOMBA-80ML",
        marca: "Carolina Herrera",
        nombre: "La Bomba",
        contenido: "80ML",
        modoPrecio: "MANUAL",
        precioVenta: 70000
      })
    ];
    const result = review(rows, existing);
    const applied = applyQualityDecisions(rows, result.findings, [], existing, 35);
    expect(applied.plan[0].modoPrecio).toBe("MANUAL");
    expect(applied.plan[0].precioVentaFinal).toBe(70000);
  });
});

// ---------------------------------------------------------------------------
// COSTOS
// ---------------------------------------------------------------------------

describe("quality-review - advertencias de costo", () => {
  it("variacion de costo >=20% contra un producto existente genera PRICE_ANOMALY (WARNING)", () => {
    const rows = parseRows("La Bomba;Carolina Herrera;80ML;70000");
    const existing = [
      existingProduct({
        sku: "SML-CAROLINA-HERRERA-LA-BOMBA-80ML",
        marca: "Carolina Herrera",
        nombre: "La Bomba",
        contenido: "80ML",
        costoUnitario: 50000
      })
    ];
    const result = review(rows, existing);
    const finding = result.findings.find((f) => f.type === "PRICE_ANOMALY");
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe("WARNING");
  });

  it("aceptar costo nuevo conserva el costo del CSV", () => {
    const rows = parseRows("La Bomba;Carolina Herrera;80ML;70000");
    const existing = [
      existingProduct({
        sku: "SML-CAROLINA-HERRERA-LA-BOMBA-80ML",
        marca: "Carolina Herrera",
        nombre: "La Bomba",
        contenido: "80ML",
        costoUnitario: 50000
      })
    ];
    const result = review(rows, existing);
    const finding = result.findings.find((f) => f.type === "PRICE_ANOMALY")!;
    const decisions: QualityDecision[] = [{ findingId: finding.id, optionId: "ACCEPT_NEW_COST" }];
    const applied = applyQualityDecisions(rows, result.findings, decisions, existing, 35);
    expect(applied.plan[0].costoUnitario).toBe(70000);
  });

  it("conservar costo existente descarta el costo del CSV", () => {
    const rows = parseRows("La Bomba;Carolina Herrera;80ML;70000");
    const existing = [
      existingProduct({
        sku: "SML-CAROLINA-HERRERA-LA-BOMBA-80ML",
        marca: "Carolina Herrera",
        nombre: "La Bomba",
        contenido: "80ML",
        costoUnitario: 50000
      })
    ];
    const result = review(rows, existing);
    const finding = result.findings.find((f) => f.type === "PRICE_ANOMALY")!;
    const decisions: QualityDecision[] = [{ findingId: finding.id, optionId: "KEEP_EXISTING_COST" }];
    const applied = applyQualityDecisions(rows, result.findings, decisions, existing, 35);
    expect(applied.plan[0].costoUnitario).toBe(50000);
  });

  it("ignorar advertencia de costo permite confirmar sin cambios (WARNING no bloquea)", () => {
    const rows = parseRows("La Bomba;Carolina Herrera;80ML;70000");
    const existing = [
      existingProduct({
        sku: "SML-CAROLINA-HERRERA-LA-BOMBA-80ML",
        marca: "Carolina Herrera",
        nombre: "La Bomba",
        contenido: "80ML",
        costoUnitario: 50000
      })
    ];
    const result = review(rows, existing);
    const applied = applyQualityDecisions(rows, result.findings, [], existing, 35);
    expect(applied.unresolvedBlockers).toHaveLength(0);
    expect(applied.plan).toHaveLength(1);
    expect(applied.plan[0].costoUnitario).toBe(70000); // sin decision: no hay correccion automatica
  });

  it("no promedia costos jamas (verificado en flujo de unificacion de duplicados)", () => {
    const rows = parseRows(
      "Versace Brigth crystal;Versace;50ML;42000",
      "Bright Crystal EDT;Versace;50ML;36000"
    );
    const result = review(rows);
    const finding = result.findings.find((f) => f.type === "POSSIBLE_DUPLICATE")!;
    const decisions: QualityDecision[] = [
      { findingId: finding.id, optionId: "UNIFY_UNDER_FIRST", costFromRow: finding.rowNumbers[0] }
    ];
    const applied = applyQualityDecisions(rows, result.findings, decisions, [], 35);
    expect(applied.plan[0].costoUnitario).not.toBe((42000 + 36000) / 2);
    expect(applied.plan[0].costoUnitario).toBe(42000);
  });
});

// ---------------------------------------------------------------------------
// UTILIDADES DE SIMILITUD (unit puro)
// ---------------------------------------------------------------------------

describe("quality-review - utilidades de similitud", () => {
  it("nameSimilarity es 1 para strings identicos y 0 para completamente distintos", () => {
    expect(nameSimilarity("bright crystal", "bright crystal")).toBe(1);
    expect(nameSimilarity("abc", "xyz")).toBeLessThan(0.3);
  });

  it("buildCandidateNameKey remueve marca repetida y descriptores de concentracion", () => {
    expect(buildCandidateNameKey("Versace Brigth crystal", "Versace")).toBe("brigth crystal");
    expect(buildCandidateNameKey("Bright Crystal EDT", "Versace")).toBe("bright crystal");
  });
});
