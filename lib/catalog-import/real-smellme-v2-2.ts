import type {
  ApplyDecisionsResult,
  QualityDecision,
  QualityFinding,
  QualityReviewResult
} from "@/lib/catalog-import/quality-review";

const AUTHORIZED_BLOCKERS = new Map<string, QualityDecision["optionId"]>([
  ["75,97", "KEEP_SECOND"],
  ["106,114", "KEEP_FIRST"]
]);

/**
 * Guardas exclusivas para la planilla real V2.2. No representa una política
 * global de deduplicación: cualquier otro blocker detiene la operación.
 */
export function buildAuthorizedSmellmeV22Decisions(review: QualityReviewResult): QualityDecision[] {
  const { filasFisicas, filasVacias, filasUtiles } = review.summary;
  if (filasFisicas !== 159 || filasVacias !== 10 || filasUtiles !== 149) {
    throw new Error(`CSV inesperado: ${filasFisicas} físicas, ${filasVacias} vacías, ${filasUtiles} útiles.`);
  }

  const blockers = review.findings.filter((finding) => finding.severity === "BLOCKER");
  if (blockers.length !== AUTHORIZED_BLOCKERS.size) {
    throw new Error(`Se esperaban exactamente 2 blockers; se detectaron ${blockers.length}.`);
  }

  return blockers.map((finding) => {
    const key = [...finding.rowNumbers].sort((a, b) => a - b).join(",");
    const optionId = AUTHORIZED_BLOCKERS.get(key);
    if (!optionId || finding.type !== "EXACT_DUPLICATE") {
      throw new Error(`Blocker no autorizado en filas ${key || "desconocidas"}.`);
    }
    return { findingId: finding.id, optionId };
  });
}

export function assertAuthorizedSmellmeV22FinalPlan(applied: ApplyDecisionsResult): void {
  if (applied.errors.length || applied.unresolvedBlockers.length) {
    throw new Error("El plan final conserva errores o blockers pendientes.");
  }
  if (applied.plan.length !== 147) {
    throw new Error(`El plan final debía contener 147 productos; contiene ${applied.plan.length}.`);
  }
  if (new Set(applied.plan.map((row) => row.sku)).size !== 147) {
    throw new Error("El plan final contiene SKU duplicados.");
  }
  if (applied.plan.some((row) => row.precioVentaCsv === null || row.modoPrecio !== "MANUAL")) {
    throw new Error("Todos los productos deben conservar Precio Venta CSV en modo MANUAL.");
  }

  assertCriticalProduct(applied.plan, "Paco Rabanne", "One Million EDT", "50ML", 20_000, 40_990);
  assertCriticalProduct(applied.plan, "Moschino", "Toy Boy EDP", "50ML", 22_000, 29_990);
}

function assertCriticalProduct(
  plan: ApplyDecisionsResult["plan"],
  marca: string,
  nombre: string,
  contenido: string,
  costo: number,
  venta: number
) {
  const matches = plan.filter((row) =>
    row.marca.toLocaleLowerCase("es") === marca.toLocaleLowerCase("es") &&
    row.nombre.toLocaleLowerCase("es") === nombre.toLocaleLowerCase("es") &&
    row.contenido.toUpperCase() === contenido
  );
  if (matches.length !== 1 || matches[0].costoUnitario !== costo || matches[0].precioVentaFinal !== venta) {
    throw new Error(`El producto crítico ${marca} ${nombre} ${contenido} no coincide con la decisión autorizada.`);
  }
}

export function blockerRows(findings: QualityFinding[]): number[][] {
  return findings
    .filter((finding) => finding.severity === "BLOCKER")
    .map((finding) => [...finding.rowNumbers].sort((a, b) => a - b));
}

