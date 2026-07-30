/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Catalog Import - Encoding
 * Descripcion: Deteccion y decodificacion de encoding para planillas CSV exportadas
 * desde Excel (UTF-8, UTF-8 con BOM o Windows-1252).
 */

import type { EncodingName } from "./types.ts";

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);

/**
 * Heuristica: si el archivo no es UTF-8 valido, Excel en Windows casi siempre
 * exporta en Windows-1252 (CP1252). No hay forma 100% certera sin metadata,
 * por lo que se intenta decodificar como UTF-8 estricto primero.
 */
export function detectEncoding(buffer: Buffer): EncodingName {
  if (buffer.length >= 3 && buffer.subarray(0, 3).equals(UTF8_BOM)) {
    return "utf-8-bom";
  }

  if (isValidUtf8(buffer)) {
    return "utf-8";
  }

  return "windows-1252";
}

function isValidUtf8(buffer: Buffer): boolean {
  let i = 0;
  const len = buffer.length;

  while (i < len) {
    const byte = buffer[i];

    if (byte <= 0x7f) {
      i += 1;
      continue;
    }

    let extraBytes = 0;
    if ((byte & 0xe0) === 0xc0) extraBytes = 1;
    else if ((byte & 0xf0) === 0xe0) extraBytes = 2;
    else if ((byte & 0xf8) === 0xf0) extraBytes = 3;
    else return false;

    if (i + extraBytes >= len) return false;

    for (let j = 1; j <= extraBytes; j += 1) {
      if ((buffer[i + j] & 0xc0) !== 0x80) return false;
    }

    i += extraBytes + 1;
  }

  return true;
}

export function decodeBuffer(buffer: Buffer, encoding: EncodingName): string {
  if (encoding === "utf-8-bom") {
    return buffer.subarray(3).toString("utf-8");
  }

  if (encoding === "windows-1252") {
    return decodeWindows1252(buffer);
  }

  return buffer.toString("utf-8");
}

/**
 * Tabla de mapeo Windows-1252 -> Unicode para el rango 0x80-0x9F (el unico
 * rango donde CP1252 difiere de Latin-1 / ISO-8859-1). El resto de bytes
 * (0x00-0x7F y 0xA0-0xFF) coincide con su codepoint Unicode directo.
 */
const CP1252_HIGH_RANGE: Record<number, number> = {
  0x80: 0x20ac,
  0x82: 0x201a,
  0x83: 0x0192,
  0x84: 0x201e,
  0x85: 0x2026,
  0x86: 0x2020,
  0x87: 0x2021,
  0x88: 0x02c6,
  0x89: 0x2030,
  0x8a: 0x0160,
  0x8b: 0x2039,
  0x8c: 0x0152,
  0x8e: 0x017d,
  0x91: 0x2018,
  0x92: 0x2019,
  0x93: 0x201c,
  0x94: 0x201d,
  0x95: 0x2022,
  0x96: 0x2013,
  0x97: 0x2014,
  0x98: 0x02dc,
  0x99: 0x2122,
  0x9a: 0x0161,
  0x9b: 0x203a,
  0x9c: 0x0153,
  0x9e: 0x017e,
  0x9f: 0x0178
};

function decodeWindows1252(buffer: Buffer): string {
  let out = "";
  for (const byte of buffer) {
    if (byte >= 0x80 && byte <= 0x9f && CP1252_HIGH_RANGE[byte] !== undefined) {
      out += String.fromCodePoint(CP1252_HIGH_RANGE[byte]);
    } else {
      out += String.fromCodePoint(byte);
    }
  }
  return out;
}
