#!/usr/bin/env node
/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: scripts/catalog/optimize-top12-images
 * Descripcion: Convierte las 12 fotografias del Top 12 a WebP optimizado,
 * respetando el mapeo generado por build-smellme-catalog.mjs
 * (data/top12-image-map.json). No recorta, no reemplaza fondos, no agrega
 * marcas de agua, no usa IA generativa: solo reduce formato/peso.
 *
 * Reglas: WebP calidad 86, autorotacion EXIF, maximo 1600px por lado, sin
 * upscale, proporcion completa preservada.
 *
 * Uso:
 *   node scripts/catalog/optimize-top12-images.mjs \
 *     --images-dir <dir con los .jpeg originales extraidos> \
 *     --image-map <ruta a top12-image-map.json> \
 *     --out-dir <public/images/perfumes/top12>
 */

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

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

const MAX_SIDE = 1600;
const WEBP_QUALITY = 86;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const imagesDir = requireArg(args, "images-dir");
  const imageMapPath = requireArg(args, "image-map");
  const outDir = requireArg(args, "out-dir");

  const imageMap = JSON.parse(fs.readFileSync(imageMapPath, "utf8"));
  fs.mkdirSync(outDir, { recursive: true });

  for (const entry of imageMap) {
    const sourcePath = path.join(imagesDir, entry.sourceFile);
    const targetFileName = path.basename(entry.imageUrl);
    const targetPath = path.join(outDir, targetFileName);

    const image = sharp(sourcePath).rotate();
    const metadata = await image.metadata();
    const width = metadata.width ?? MAX_SIDE;
    const height = metadata.height ?? MAX_SIDE;
    const longestSide = Math.max(width, height);

    const pipeline =
      longestSide > MAX_SIDE
        ? image.resize({
            width: width >= height ? MAX_SIDE : undefined,
            height: height > width ? MAX_SIDE : undefined,
            fit: "inside",
            withoutEnlargement: true
          })
        : image;

    await pipeline.webp({ quality: WEBP_QUALITY }).toFile(targetPath);

    const outMeta = await sharp(targetPath).metadata();
    console.log(
      `rank ${entry.rank}: ${entry.sourceFile} -> ${targetFileName} (${outMeta.width}x${outMeta.height}, ${fs.statSync(targetPath).size} bytes)`
    );
  }

  console.log(`Listo: ${imageMap.length} imagenes optimizadas en ${outDir}`);
}

main().catch((error) => {
  console.error("Error al optimizar imagenes:", error.message);
  process.exitCode = 1;
});
