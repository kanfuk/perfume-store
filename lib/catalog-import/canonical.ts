/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Catalog Import - Catalogo canonico
 * Descripcion: Construye el catalogo canonico final a partir de la reconciliacion:
 * julio es el universo canonico (nombre/marca/contenido + costo), enriquecido con
 * junio (costo alternativo + precio de venta) cuando existe match unico y confiable.
 * Nunca inventa precio, stock, ni activa automaticamente productos "solo junio".
 */

import type { CanonicalProduct, ReconciledEntry } from "./types.ts";
import { assignDeterministicSkus } from "./sku.ts";
import { normalizeContenido, normalizeDisplayText } from "./normalization.ts";
import { computeEstadoDatos } from "./validation.ts";

export type CanonicalBuildResult = {
  products: CanonicalProduct[];
  reviewEntries: ReconciledEntry[];
};

export function buildCanonicalCatalog(entries: ReconciledEntry[]): CanonicalBuildResult {
  const resolvable = entries.filter(
    (e) => e.classification === "MATCH_EXACTO" || e.classification === "MATCH_NORMALIZADO" || e.classification === "SOLO_JULIO" || e.classification === "SOLO_JUNIO"
  );

  const fieldsByEntry = new Map<ReconciledEntry, { marca: string; nombre: string; contenido: string }>();
  for (const entry of resolvable) {
    const source = entry.julioRow ?? entry.junioRow;
    if (!source) continue;
    fieldsByEntry.set(entry, {
      marca: source.marca,
      nombre: source.perfume,
      contenido: source.contenido
    });
  }

  const skuMap = assignDeterministicSkus(resolvable, (entry) => fieldsByEntry.get(entry)!);

  const products: CanonicalProduct[] = resolvable.map((entry) => {
    const sku = skuMap.get(entry)!;
    const fields = fieldsByEntry.get(entry)!;

    // Costo: prioridad julio (Precio Compra), luego junio (Costo Unitario).
    let costoUnitario: number | null = null;
    let origenCosto: "julio" | "junio" | null = null;
    if (entry.julioRow?.precioCompra !== undefined) {
      costoUnitario = entry.julioRow.precioCompra;
      origenCosto = "julio";
    } else if (entry.junioRow?.costoUnitario !== undefined) {
      costoUnitario = entry.junioRow.costoUnitario;
      origenCosto = "junio";
    }

    // Precio de venta: SOLO disponible en junio (julio no tiene esa columna).
    let precioVenta: number | null = null;
    let origenPrecio: "julio" | "junio" | null = null;
    if (entry.junioRow?.precioVenta !== undefined) {
      precioVenta = entry.junioRow.precioVenta;
      origenPrecio = "junio";
    }

    // Stock: ninguna planilla fuente trae cantidad de stock. Nunca se infiere.
    const stock: number | null = null;

    const estadoDatos = computeEstadoDatos(precioVenta, stock);
    const activo = estadoDatos === "COMPLETO";

    const observaciones: string[] = [];
    if (entry.classification === "SOLO_JULIO") {
      observaciones.push("Producto presente solo en la planilla de julio.");
    }
    if (entry.classification === "SOLO_JUNIO") {
      observaciones.push(
        "Producto presente solo en la planilla de junio. No se activa automaticamente."
      );
    }
    if (estadoDatos.includes("FALTA_PRECIO")) {
      observaciones.push("Falta precio de venta confirmado.");
    }
    if (estadoDatos.includes("FALTA_STOCK")) {
      observaciones.push("Falta stock real (ninguna planilla fuente trae cantidad de stock).");
    }

    const product: CanonicalProduct = {
      sku,
      nombre: normalizeDisplayText(fields.nombre),
      marca: normalizeDisplayText(fields.marca),
      contenido: normalizeContenido(fields.contenido),
      costoUnitario,
      precioVenta,
      stock,
      activo,
      esTop: false,
      ordenDestacado: null,
      esOfertaSemana: false,
      precioAnterior: null,
      imageUrl: null,
      origenCosto,
      origenPrecio,
      estadoDatos,
      observacionesImportacion: observaciones.join(" "),
      classification: entry.classification
    };

    return product;
  });

  const reviewEntries = entries.filter(
    (e) => e.classification === "AMBIGUO" || e.classification === "DUPLICADO" || e.classification === "FILA_INVALIDA"
  );

  return { products, reviewEntries };
}
