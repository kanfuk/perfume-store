#!/usr/bin/env node
/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: scripts/catalog/build-smellme-catalog
 * Descripcion: Orquesta la reconciliacion de las planillas de julio/junio, construye
 * el catalogo canonico, asocia el Top 12 y escribe todos los reportes en
 * --out-dir. No escribe en Supabase ni hace commit/push. Salida determinista:
 * ejecutar dos veces con las mismas entradas produce archivos identicos
 * (mismos hashes), salvo el campo informativo "generatedAt" del dry-run JSON.
 *
 * Uso:
 *   node scripts/catalog/build-smellme-catalog.mjs \
 *     --julio <ruta.csv> --junio <ruta.csv> --out-dir <dir> [--images-dir <dir>]
 *
 * Ninguna ruta esta hardcodeada: todas se reciben por argumento.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  detectEncoding,
  decodeBuffer,
  detectDelimiter,
  parseJulioRows,
  parseJunioRows,
  reconcile,
  buildCanonicalCatalog,
  buildTop12ImageEntries
} from "../../lib/catalog-import/index.ts";
import { toCsv } from "./csv-writer.mjs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        args[key] = true;
      } else {
        args[key] = next;
        i += 1;
      }
    }
  }
  return args;
}

function requireArg(args, name) {
  const value = args[name];
  if (!value || value === true) {
    throw new Error(`Falta el argumento requerido --${name}`);
  }
  return value;
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function sha256Text(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function readSourceRows(filePath, kind) {
  const buffer = fs.readFileSync(filePath);
  const encoding = detectEncoding(buffer);
  const text = decodeBuffer(buffer, encoding);
  const delimiter = detectDelimiter(text);
  const parsed = kind === "julio" ? parseJulioRows(text, delimiter) : parseJunioRows(text, delimiter);
  return { encoding, delimiter, parsed };
}

// Ranking Top 12 identificado por inspeccion visual directa de cada fotografia
// (marca y nombre tal como aparecen impresos en la caja/frasco). El contenido
// (ml) NO se incluye aqui porque el nombre canonico final debe salir de las
// planillas, no de la foto.
const TOP12_RANKING = [
  { rank: 1, marca: "Jean Paul Gaultier", nombre: "Le Male Elixir Absolu" },
  { rank: 2, marca: "Jean Paul Gaultier", nombre: "Le Beau" },
  { rank: 3, marca: "Carolina Herrera", nombre: "La Bomba" },
  { rank: 4, marca: "Carolina Herrera", nombre: "212 Men Heroes Forever Young" },
  { rank: 5, marca: "Xerjoff", nombre: "Naxos" },
  { rank: 6, marca: "Carolina Herrera", nombre: "212 Heroes Forever Young" },
  { rank: 7, marca: "Ralph Lauren", nombre: "Polo Blue" },
  { rank: 8, marca: "Yves Saint Laurent", nombre: "MYSLF Eau de Parfum" },
  { rank: 9, marca: "Creed", nombre: "Millesime Imperial" },
  { rank: 10, marca: "Giorgio Armani", nombre: "Acqua di Gio Profondo Parfum" },
  { rank: 11, marca: "Christian Dior", nombre: "Sauvage Parfum" },
  { rank: 12, marca: "Lancome", nombre: "La Vie Est Belle" }
];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const julioPath = requireArg(args, "julio");
  const junioPath = requireArg(args, "junio");
  const outDir = requireArg(args, "out-dir");
  const imagesMapPath = typeof args["image-map"] === "string" ? args["image-map"] : null;

  fs.mkdirSync(outDir, { recursive: true });

  const julio = readSourceRows(julioPath, "julio");
  const junio = readSourceRows(junioPath, "junio");

  const summary = reconcile(julio.parsed.rows, junio.parsed.rows);
  const { products, reviewEntries } = buildCanonicalCatalog(summary.entries);

  const productsSorted = [...products].sort((a, b) => a.sku.localeCompare(b.sku));

  const canonicalHeaders = [
    "sku",
    "nombre",
    "marca",
    "contenido",
    "costo_unitario",
    "precio_venta",
    "stock",
    "activo",
    "es_top",
    "orden_destacado",
    "es_oferta_semana",
    "precio_anterior",
    "image_url",
    "origen_costo",
    "origen_precio",
    "estado_datos",
    "observaciones_importacion"
  ];

  function toCanonicalRow(p) {
    return {
      sku: p.sku,
      nombre: p.nombre,
      marca: p.marca,
      contenido: p.contenido,
      costo_unitario: p.costoUnitario ?? "",
      precio_venta: p.precioVenta ?? "",
      stock: p.stock ?? "",
      activo: p.activo,
      es_top: p.esTop,
      orden_destacado: p.ordenDestacado ?? "",
      es_oferta_semana: p.esOfertaSemana,
      precio_anterior: p.precioAnterior ?? "",
      image_url: p.imageUrl ?? "",
      origen_costo: p.origenCosto ?? "",
      origen_precio: p.origenPrecio ?? "",
      estado_datos: p.estadoDatos,
      observaciones_importacion: p.observacionesImportacion
    };
  }

  // --- Top 12: asociar imagenes extraidas con el catalogo canonico ---
  // El nombre de archivo usa la etiqueta REALMENTE observada en la foto
  // (marca+nombre impresos en la caja/frasco), no un nombre canonico
  // inventado: la mayoria de las 12 fotos no tiene match confirmado en las
  // planillas, y no se fabrica un nombre comercial para ellas.
  function observedSlug(rank) {
    const item = TOP12_RANKING.find((r) => r.rank === rank);
    const base = item ? `${item.marca} ${item.nombre}` : `foto-${rank}`;
    return base
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  const imagesDir = typeof args["images-dir"] === "string" ? args["images-dir"] : null;
  let top12Entries = [];
  if (imagesDir && fs.existsSync(imagesDir)) {
    const imageFiles = fs
      .readdirSync(imagesDir)
      .filter((f) => /\.(jpe?g|png)$/i.test(f))
      .sort();

    const images = imageFiles.map((file, index) => {
      const rank = index + 1;
      return {
        rank,
        sourceFile: file,
        sourceSha256: sha256File(path.join(imagesDir, file)),
        imageUrl: `/images/perfumes/top12/top-${String(rank).padStart(2, "0")}-${observedSlug(rank)}.webp`
      };
    });

    const ambiguousEntries = reviewEntries.filter((e) => e.classification === "AMBIGUO");
    top12Entries = buildTop12ImageEntries(TOP12_RANKING, images, products, ambiguousEntries);
  }

  // Aplicar es_top/orden_destacado SOLO a asociaciones confirmadas (MATCH_CONFIRMADO).
  const productBySku = new Map(products.map((p) => [p.sku, p]));
  for (const entry of top12Entries) {
    if (entry.matchStatus === "MATCH_CONFIRMADO" && entry.canonicalSku) {
      const product = productBySku.get(entry.canonicalSku);
      if (product) {
        product.esTop = true;
        product.ordenDestacado = entry.rank;
        product.imageUrl = entry.imageUrl;
      }
    }
  }

  // --- Escribir catalogo canonico + review ---
  fs.writeFileSync(
    path.join(outDir, "smellme-catalog-canonical.csv"),
    toCsv(canonicalHeaders, productsSorted.map(toCanonicalRow)),
    "utf8"
  );

  const reviewHeaders = [
    "classification",
    "julio_fila",
    "julio_perfume",
    "julio_marca",
    "julio_contenido",
    "junio_fila",
    "junio_perfume",
    "junio_marca",
    "junio_contenido",
    "invalid_reason"
  ];
  function toReviewRow(e) {
    return {
      classification: e.classification,
      julio_fila: e.julioRow?.rowNumber ?? "",
      julio_perfume: e.julioRow?.perfume ?? "",
      julio_marca: e.julioRow?.marca ?? "",
      julio_contenido: e.julioRow?.contenido ?? "",
      junio_fila: e.junioRow?.rowNumber ?? "",
      junio_perfume: e.junioRow?.perfume ?? "",
      junio_marca: e.junioRow?.marca ?? "",
      junio_contenido: e.junioRow?.contenido ?? "",
      invalid_reason: e.invalidReason ?? ""
    };
  }
  const reviewSorted = [...reviewEntries].sort((a, b) => a.key.localeCompare(b.key));
  fs.writeFileSync(
    path.join(outDir, "smellme-catalog-review.csv"),
    toCsv(reviewHeaders, reviewSorted.map(toReviewRow)),
    "utf8"
  );

  fs.writeFileSync(
    path.join(outDir, "smellme-only-july.csv"),
    toCsv(canonicalHeaders, productsSorted.filter((p) => p.classification === "SOLO_JULIO").map(toCanonicalRow)),
    "utf8"
  );
  fs.writeFileSync(
    path.join(outDir, "smellme-only-june.csv"),
    toCsv(canonicalHeaders, productsSorted.filter((p) => p.classification === "SOLO_JUNIO").map(toCanonicalRow)),
    "utf8"
  );
  fs.writeFileSync(
    path.join(outDir, "smellme-ambiguous.csv"),
    toCsv(reviewHeaders, reviewSorted.filter((e) => e.classification === "AMBIGUO").map(toReviewRow)),
    "utf8"
  );
  fs.writeFileSync(
    path.join(outDir, "smellme-duplicates.csv"),
    toCsv(reviewHeaders, reviewSorted.filter((e) => e.classification === "DUPLICADO").map(toReviewRow)),
    "utf8"
  );
  fs.writeFileSync(
    path.join(outDir, "smellme-invalid.csv"),
    toCsv(reviewHeaders, reviewSorted.filter((e) => e.classification === "FILA_INVALIDA").map(toReviewRow)),
    "utf8"
  );

  const importable = productsSorted.filter((p) => p.estadoDatos === "COMPLETO");
  const blocked = productsSorted.filter((p) => p.estadoDatos !== "COMPLETO");
  fs.writeFileSync(
    path.join(outDir, "smellme-importable.csv"),
    toCsv(canonicalHeaders, importable.map(toCanonicalRow)),
    "utf8"
  );
  fs.writeFileSync(
    path.join(outDir, "smellme-blocked.csv"),
    toCsv(canonicalHeaders, blocked.map(toCanonicalRow)),
    "utf8"
  );

  const top12Headers = ["rank", "source_file", "source_sha256", "canonical_sku", "canonical_name", "canonical_brand", "image_url", "match_status", "candidates", "notes"];
  const top12Rows = top12Entries.map((t) => ({
    rank: t.rank,
    source_file: t.sourceFile,
    source_sha256: t.sourceSha256,
    canonical_sku: t.canonicalSku ?? "",
    canonical_name: t.canonicalName ?? "",
    canonical_brand: t.canonicalBrand ?? "",
    image_url: t.imageUrl,
    match_status: t.matchStatus,
    candidates: (t.candidates ?? []).join(" | "),
    notes: t.notes ?? ""
  }));
  fs.writeFileSync(path.join(outDir, "smellme-top12-map.csv"), toCsv(top12Headers, top12Rows), "utf8");

  if (imagesMapPath) {
    fs.mkdirSync(path.dirname(imagesMapPath), { recursive: true });
    fs.writeFileSync(imagesMapPath, `${JSON.stringify(top12Entries, null, 2)}\n`, "utf8");
  }

  // --- Reporte markdown ---
  const estadoCounts = {};
  for (const p of products) estadoCounts[p.estadoDatos] = (estadoCounts[p.estadoDatos] ?? 0) + 1;
  const classificationCounts = {};
  for (const e of summary.entries) classificationCounts[e.classification] = (classificationCounts[e.classification] ?? 0) + 1;
  const conCosto = products.filter((p) => p.costoUnitario !== null).length;
  const sinCosto = products.length - conCosto;
  const conPrecio = products.filter((p) => p.precioVenta !== null).length;
  const sinPrecio = products.length - conPrecio;
  const conStock = products.filter((p) => p.stock !== null).length;
  const sinStock = products.length - conStock;
  const top12Ambiguos = top12Entries.filter((t) => t.matchStatus === "AMBIGUO").length;
  const top12Confirmados = top12Entries.filter((t) => t.matchStatus === "MATCH_CONFIRMADO").length;
  const top12Candidato = top12Entries.filter((t) => t.matchStatus === "CANDIDATO_UNICO_NO_CONFIRMADO").length;
  const top12SinMatch = top12Entries.filter((t) => t.matchStatus === "SIN_MATCH_EN_PLANILLAS").length;

  const outputFiles = [
    "smellme-catalog-canonical.csv",
    "smellme-catalog-review.csv",
    "smellme-only-july.csv",
    "smellme-only-june.csv",
    "smellme-ambiguous.csv",
    "smellme-duplicates.csv",
    "smellme-invalid.csv",
    "smellme-top12-map.csv",
    "smellme-importable.csv",
    "smellme-blocked.csv"
  ];
  const outputHashes = Object.fromEntries(
    outputFiles.map((f) => [f, sha256File(path.join(outDir, f))])
  );

  const reportLines = [];
  reportLines.push("# Reporte de importacion de catalogo Smellme.cl");
  reportLines.push("");
  reportLines.push("## Fuentes");
  reportLines.push(`- Julio: encoding=${julio.encoding}, delimitador="${julio.delimiter}", filas fisicas=${julio.parsed.filasFisicas}, filas vacias=${julio.parsed.filasVacias}, filas utiles=${julio.parsed.filasUtiles}`);
  reportLines.push(`- Junio: encoding=${junio.encoding}, delimitador="${junio.delimiter}", filas fisicas=${junio.parsed.filasFisicas}, filas vacias=${junio.parsed.filasVacias}, filas utiles=${junio.parsed.filasUtiles}`);
  reportLines.push("");
  reportLines.push("## Clasificacion de reconciliacion");
  for (const [k, v] of Object.entries(classificationCounts)) reportLines.push(`- ${k}: ${v}`);
  reportLines.push("");
  reportLines.push("## Catalogo canonico");
  reportLines.push(`- Productos canonicos totales: ${products.length}`);
  for (const [k, v] of Object.entries(estadoCounts)) reportLines.push(`- Estado ${k}: ${v}`);
  reportLines.push(`- Con costo: ${conCosto} / Sin costo: ${sinCosto}`);
  reportLines.push(`- Con precio de venta: ${conPrecio} / Sin precio de venta: ${sinPrecio}`);
  reportLines.push(`- Con stock: ${conStock} / Sin stock: ${sinStock} (ninguna planilla fuente trae cantidad de stock; nunca se infiere)`);
  reportLines.push(`- Importables (estado COMPLETO, activables): ${importable.length}`);
  reportLines.push(`- Bloqueados (dato incompleto, no se activan): ${blocked.length}`);
  reportLines.push("");
  reportLines.push("## Top 12");
  reportLines.push(`- Confirmados (MATCH_CONFIRMADO): ${top12Confirmados}`);
  reportLines.push(`- Candidato unico no confirmado: ${top12Candidato}`);
  reportLines.push(`- Ambiguos (multiples candidatos): ${top12Ambiguos}`);
  reportLines.push(`- Sin match en planillas: ${top12SinMatch}`);
  reportLines.push("");
  reportLines.push("## Hashes de archivos de salida (SHA-256)");
  for (const [f, h] of Object.entries(outputHashes)) reportLines.push(`- ${f}: ${h}`);
  reportLines.push("");

  fs.writeFileSync(path.join(outDir, "smellme-import-report.md"), `${reportLines.join("\n")}\n`, "utf8");

  const dryRun = {
    fuentes: {
      julio: { encoding: julio.encoding, delimitador: julio.delimiter, ...julio.parsed, rows: undefined },
      junio: { encoding: junio.encoding, delimitador: junio.delimiter, ...junio.parsed, rows: undefined }
    },
    clasificacion: classificationCounts,
    catalogoCanonico: {
      total: products.length,
      estados: estadoCounts,
      conCosto,
      sinCosto,
      conPrecio,
      sinPrecio,
      conStock,
      sinStock,
      importables: importable.length,
      bloqueados: blocked.length
    },
    top12: {
      confirmados: top12Confirmados,
      candidatoUnico: top12Candidato,
      ambiguos: top12Ambiguos,
      sinMatch: top12SinMatch
    },
    hashesSalida: outputHashes,
    supabase: {
      modo: "SOLO_LECTURA",
      escrituraEjecutada: false
    }
  };
  const dryRunPath = path.join(outDir, "smellme-dry-run.json");
  fs.writeFileSync(dryRunPath, `${JSON.stringify(dryRun, null, 2)}\n`, "utf8");

  console.log(`Catalogo canonico: ${products.length} productos (${importable.length} importables, ${blocked.length} bloqueados).`);
  console.log(`Top12: ${top12Confirmados} confirmados, ${top12Candidato} candidato unico, ${top12Ambiguos} ambiguos, ${top12SinMatch} sin match.`);
  console.log(`Reportes escritos en: ${outDir}`);
  console.log(`Dry-run JSON: ${dryRunPath} (hash: ${sha256Text(fs.readFileSync(dryRunPath, "utf8"))})`);
}

main().catch((error) => {
  console.error("Error al construir el catalogo:", error.message);
  process.exitCode = 1;
});
