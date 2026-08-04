/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Importador CSV - helpers de UI para hallazgos bloqueantes sin resolver.
 * Descripcion: El servidor (final-plan/confirm) revalida las decisiones desde
 * cero y puede devolver hallazgos que el cliente creia resueltos (ej. "mantener
 * separadas" sin un nombre final distinto). Sin esto, esos hallazgos quedaban
 * escondidos en la pestaña "Resueltos" y el admin no encontraba que producto
 * arreglar: un callejon sin salida. Funciones puras para poder probarlas sin
 * levantar el componente (el proyecto no tiene jsdom/React Testing Library).
 * Reutiliza CatalogQualityReview (FindingCard) para la resolucion real:
 * estas funciones solo deciden que decision limpiar y que mensaje mostrar,
 * nunca implementan un segundo sistema de revision.
 */

import type { QualityFinding } from "@/lib/catalog-import/quality-review.ts";

/**
 * Quita del mapa de decisiones UNICAMENTE los hallazgos que el servidor
 * todavia considera bloqueantes -- las decisiones de cualquier otro
 * hallazgo (ya resuelto de verdad) se conservan intactas.
 */
export function clearUnresolvedDecisions<T>(
  decisions: Record<string, T>,
  unresolvedFindingIds: Iterable<string>
): Record<string, T> {
  const next = { ...decisions };
  for (const id of unresolvedFindingIds) {
    delete next[id];
  }
  return next;
}

/**
 * Mensaje mostrado al admin cuando quedan hallazgos bloqueantes sin
 * resolver tras final-plan/confirm. Identifica el producto (nombre de fila
 * si esta disponible, si no el numero de fila) y la razon (la explicacion
 * del propio hallazgo, la misma que ya se muestra en su FindingCard), y
 * dice donde encontrarlo para actuar.
 */
export function buildUnresolvedBlockersMessage(unresolvedBlockers: QualityFinding[]): string {
  const [first, ...rest] = unresolvedBlockers;
  if (!first) return "";

  const productLabel = first.rows[0]?.nombre?.trim()
    ? `"${first.rows[0].nombre}"`
    : `de la fila ${first.rowNumbers[0]}`;
  const otherCount = rest.length;

  return (
    `El producto ${productLabel} sigue bloqueado: ${first.explanation} ` +
    `Volvió a la pestaña Pendientes para que lo excluyas, lo edites o confirmes la coincidencia manual.` +
    (otherCount > 0 ? ` Hay ${otherCount} conflicto(s) más sin resolver.` : "")
  );
}
