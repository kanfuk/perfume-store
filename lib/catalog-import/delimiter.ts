/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Catalog Import - Delimitador
 * Descripcion: Deteccion del delimitador de campos (coma, punto y coma o tabulador)
 * a partir de la primera linea no vacia del archivo.
 */

import type { DelimiterChar } from "./types.ts";

const CANDIDATES: DelimiterChar[] = [";", ",", "\t"];

export function detectDelimiter(sampleText: string): DelimiterChar {
  const firstLine = sampleText.split(/\r\n|\n|\r/).find((line) => line.trim().length > 0) ?? "";

  let best: DelimiterChar = ";";
  let bestCount = -1;

  for (const candidate of CANDIDATES) {
    const count = countOutsideQuotes(firstLine, candidate);
    if (count > bestCount) {
      bestCount = count;
      best = candidate;
    }
  }

  return best;
}

function countOutsideQuotes(line: string, char: string): number {
  let count = 0;
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && c === char) {
      count += 1;
    }
  }

  return count;
}
