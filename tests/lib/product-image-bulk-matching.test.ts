import { describe, expect, it } from "vitest";
import {
  canConfirmBulkUpload,
  checkBulkFileCountLimit,
  matchBulkProductImages,
  normalizeBulkImageIdentity,
  stripFileExtension,
  validateBulkImageFile
} from "@/lib/product-image-bulk-matching";
import type { BulkImageCandidateProduct, BulkImageDecision, BulkImageInputFile } from "@/lib/product-image-bulk-types";

function file(overrides: Partial<BulkImageInputFile> & { fileName: string }): BulkImageInputFile {
  return {
    fileId: overrides.fileName,
    fileSize: 1024,
    mimeType: "image/jpeg",
    ...overrides
  };
}

function product(overrides: Partial<BulkImageCandidateProduct> & { id: string; nombre: string }): BulkImageCandidateProduct {
  return { ...overrides };
}

describe("normalizeBulkImageIdentity", () => {
  it("normaliza mayusculas/minusculas", () => {
    expect(normalizeBulkImageIdentity("sml-0001")).toBe(normalizeBulkImageIdentity("SML-0001"));
  });

  it("unifica guiones, guiones bajos y espacios como separador", () => {
    const expected = "SML-0001";
    expect(normalizeBulkImageIdentity("SML-0001")).toBe(expected);
    expect(normalizeBulkImageIdentity("SML_0001")).toBe(expected);
    expect(normalizeBulkImageIdentity("SML 0001")).toBe(expected);
  });

  it("ignora el sufijo front al final", () => {
    expect(normalizeBulkImageIdentity("SML-0001-front")).toBe("SML-0001");
  });

  it("ignora el sufijo principal al final", () => {
    expect(normalizeBulkImageIdentity("SML-0001-principal")).toBe("SML-0001");
  });

  it("ignora varios sufijos consecutivos al final", () => {
    expect(normalizeBulkImageIdentity("SML-0001-foto-image")).toBe("SML-0001");
  });

  it("no quita un sufijo si no esta al final", () => {
    expect(normalizeBulkImageIdentity("FRONT-SML-0001")).toBe("FRONT-SML-0001");
  });

  it("devuelve cadena vacia si el nombre es solo un sufijo ignorado", () => {
    expect(normalizeBulkImageIdentity("front")).toBe("");
  });
});

describe("stripFileExtension", () => {
  it("quita la extension", () => {
    expect(stripFileExtension("SML-0001.jpg")).toBe("SML-0001");
  });

  it("no rompe nombres sin extension", () => {
    expect(stripFileExtension("SML-0001")).toBe("SML-0001");
  });
});

describe("validateBulkImageFile", () => {
  it("acepta jpg/png/webp/avif validos", () => {
    expect(validateBulkImageFile({ fileName: "a.jpg", fileSize: 100, mimeType: "image/jpeg" }).ok).toBe(true);
    expect(validateBulkImageFile({ fileName: "a.png", fileSize: 100, mimeType: "image/png" }).ok).toBe(true);
    expect(validateBulkImageFile({ fileName: "a.webp", fileSize: 100, mimeType: "image/webp" }).ok).toBe(true);
    expect(validateBulkImageFile({ fileName: "a.avif", fileSize: 100, mimeType: "image/avif" }).ok).toBe(true);
  });

  it("rechaza formato no permitido", () => {
    const result = validateBulkImageFile({ fileName: "a.gif", fileSize: 100, mimeType: "image/gif" });
    expect(result.ok).toBe(false);
  });

  it("rechaza archivo vacio", () => {
    const result = validateBulkImageFile({ fileName: "a.jpg", fileSize: 0, mimeType: "image/jpeg" });
    expect(result).toEqual({ ok: false, reason: "El archivo está vacío." });
  });

  it("rechaza nombre vacio", () => {
    const result = validateBulkImageFile({ fileName: "   ", fileSize: 100, mimeType: "image/jpeg" });
    expect(result.ok).toBe(false);
  });

  it("rechaza tamano excesivo", () => {
    const result = validateBulkImageFile({ fileName: "a.jpg", fileSize: 999_000_000, mimeType: "image/jpeg" });
    expect(result).toEqual({ ok: false, reason: "El archivo supera el tamaño permitido." });
  });

  it("rechaza MIME inconsistente con los formatos aceptados", () => {
    const result = validateBulkImageFile({ fileName: "a.jpg", fileSize: 100, mimeType: "text/plain" });
    expect(result.ok).toBe(false);
  });

  it("rechaza extension inconsistente con el MIME declarado", () => {
    const result = validateBulkImageFile({ fileName: "a.jpg", fileSize: 100, mimeType: "image/png" });
    expect(result).toEqual({ ok: false, reason: "La extensión del archivo no coincide con su contenido." });
  });
});

describe("checkBulkFileCountLimit", () => {
  it("permite hasta el maximo", () => {
    expect(checkBulkFileCountLimit(0, 100, 100).ok).toBe(true);
    expect(checkBulkFileCountLimit(50, 50, 100).ok).toBe(true);
  });

  it("rechaza mas de 100 archivos", () => {
    const result = checkBulkFileCountLimit(0, 101, 100);
    expect(result.ok).toBe(false);
  });

  it("rechaza cuando la seleccion existente mas la nueva superan el maximo", () => {
    const result = checkBulkFileCountLimit(90, 20, 100);
    expect(result.ok).toBe(false);
  });
});

describe("matchBulkProductImages - SKU", () => {
  it("SKU exacto normalizado", () => {
    const products = [product({ id: "p1", sku: "SML-0001", nombre: "La Vida Es Bella" })];
    const rows = matchBulkProductImages([file({ fileName: "SML-0001.jpg" })], products);
    expect(rows[0].status).toBe("MATCHED_BY_SKU");
    expect(rows[0].matchedProductId).toBe("p1");
    expect(rows[0].ready).toBe(true);
  });

  it("SKU case-insensitive", () => {
    const products = [product({ id: "p1", sku: "SML-0001", nombre: "X" })];
    const rows = matchBulkProductImages([file({ fileName: "sml-0001.jpg" })], products);
    expect(rows[0].status).toBe("MATCHED_BY_SKU");
  });

  it("SKU con guiones bajos en el archivo", () => {
    const products = [product({ id: "p1", sku: "SML-0001", nombre: "X" })];
    const rows = matchBulkProductImages([file({ fileName: "SML_0001.jpg" })], products);
    expect(rows[0].status).toBe("MATCHED_BY_SKU");
  });

  it("SKU con espacios en el archivo", () => {
    const products = [product({ id: "p1", sku: "SML-0001", nombre: "X" })];
    const rows = matchBulkProductImages([file({ fileName: "SML 0001.jpg" })], products);
    expect(rows[0].status).toBe("MATCHED_BY_SKU");
  });

  it("SKU con sufijo front", () => {
    const products = [product({ id: "p1", sku: "SML-0001", nombre: "X" })];
    const rows = matchBulkProductImages([file({ fileName: "SML-0001-front.jpg" })], products);
    expect(rows[0].status).toBe("MATCHED_BY_SKU");
  });

  it("SKU con sufijo principal", () => {
    const products = [product({ id: "p1", sku: "SML-0001", nombre: "X" })];
    const rows = matchBulkProductImages([file({ fileName: "SML-0001-principal.jpg" })], products);
    expect(rows[0].status).toBe("MATCHED_BY_SKU");
  });
});

describe("matchBulkProductImages - nombre", () => {
  it("nombre exacto unico", () => {
    const products = [product({ id: "p1", nombre: "La Vida Es Bella" })];
    const rows = matchBulkProductImages([file({ fileName: "La Vida Es Bella.jpg" })], products);
    expect(rows[0].status).toBe("MATCHED_BY_EXACT_NAME");
    expect(rows[0].matchedProductId).toBe("p1");
  });

  it("nombre ambiguo entre dos marcas queda AMBIGUOUS", () => {
    const products = [
      product({ id: "p1", nombre: "212 Vip", marca: "Carolina Herrera" }),
      product({ id: "p2", nombre: "212 Vip", marca: "Otra Marca" })
    ];
    const rows = matchBulkProductImages([file({ fileName: "212 Vip.jpg" })], products);
    expect(rows[0].status).toBe("AMBIGUOUS");
    expect(rows[0].candidateProductIds.sort()).toEqual(["p1", "p2"]);
    expect(rows[0].blocking).toBe(true);
  });

  it("marca + nombre desambigua cuando el archivo incluye la marca", () => {
    const products = [
      product({ id: "p1", nombre: "212 Vip", marca: "Carolina Herrera" }),
      product({ id: "p2", nombre: "212 Vip", marca: "Otra Marca" })
    ];
    const rows = matchBulkProductImages([file({ fileName: "Carolina Herrera 212 Vip.jpg" })], products);
    expect(rows[0].status).toBe("MATCHED_BY_BRAND_NAME");
    expect(rows[0].matchedProductId).toBe("p1");
  });

  it("marca + nombre + contenido desambigua variantes de la misma marca/nombre", () => {
    const products = [
      product({ id: "p1", nombre: "212 Vip", marca: "Carolina Herrera", contenido: "30ML" }),
      product({ id: "p2", nombre: "212 Vip", marca: "Carolina Herrera", contenido: "100ML" })
    ];
    const rows = matchBulkProductImages([file({ fileName: "Carolina Herrera 212 Vip 100ML.jpg" })], products);
    expect(rows[0].status).toBe("MATCHED_BY_FULL_IDENTITY");
    expect(rows[0].matchedProductId).toBe("p2");
  });

  it("producto inexistente (sin ninguna coincidencia) queda UNMATCHED y no bloquea", () => {
    const products = [product({ id: "p1", nombre: "Otro perfume" })];
    const rows = matchBulkProductImages([file({ fileName: "No Existe.jpg" })], products);
    expect(rows[0].status).toBe("UNMATCHED");
    expect(rows[0].blocking).toBe(false);
    expect(rows[0].ready).toBe(false);
  });

  it("catalogo vacio: todo queda UNMATCHED", () => {
    const rows = matchBulkProductImages([file({ fileName: "SML-0001.jpg" })], []);
    expect(rows[0].status).toBe("UNMATCHED");
    expect(canConfirmBulkUpload(rows)).toBe(false);
  });
});

describe("matchBulkProductImages - duplicados", () => {
  it("dos archivos con el mismo nombre quedan DUPLICATE_FILENAME", () => {
    const products = [product({ id: "p1", sku: "SML-0001", nombre: "X" })];
    const files = [
      file({ fileId: "a", fileName: "SML-0001.jpg" }),
      file({ fileId: "b", fileName: "SML-0001.jpg" })
    ];
    const rows = matchBulkProductImages(files, products);
    expect(rows.every((row) => row.status === "DUPLICATE_FILENAME")).toBe(true);
    expect(canConfirmBulkUpload(rows)).toBe(false);
  });

  it("dos archivos distintos asociados al mismo producto quedan DUPLICATE_PRODUCT_ASSIGNMENT", () => {
    const products = [product({ id: "p1", sku: "SML-0001", nombre: "La Vida Es Bella" })];
    const files = [
      file({ fileId: "a", fileName: "SML-0001.jpg" }),
      file({ fileId: "b", fileName: "La Vida Es Bella.jpg" })
    ];
    const rows = matchBulkProductImages(files, products);
    expect(rows.every((row) => row.status === "DUPLICATE_PRODUCT_ASSIGNMENT")).toBe(true);
    expect(canConfirmBulkUpload(rows)).toBe(false);
  });
});

describe("matchBulkProductImages - asociacion manual", () => {
  it("asociacion manual asigna el producto elegido", () => {
    const products = [product({ id: "p1", nombre: "X" }), product({ id: "p2", nombre: "Y" })];
    const decisions: Record<string, BulkImageDecision> = { a: { manualProductId: "p2" } };
    const rows = matchBulkProductImages([file({ fileId: "a", fileName: "cualquiera.jpg" })], products, decisions);
    expect(rows[0].status).toBe("MANUALLY_MATCHED");
    expect(rows[0].matchedProductId).toBe("p2");
    expect(rows[0].ready).toBe(true);
  });

  it("excluir una fila la deja EXCLUDED y no bloqueante", () => {
    const products = [product({ id: "p1", nombre: "X" })];
    const decisions: Record<string, BulkImageDecision> = { a: { excluded: true } };
    const rows = matchBulkProductImages([file({ fileId: "a", fileName: "sin-match.jpg" })], products, decisions);
    expect(rows[0].status).toBe("EXCLUDED");
    expect(rows[0].blocking).toBe(false);
    expect(rows[0].ready).toBe(false);
  });

  it("deshacer una asociacion manual (manualProductId null) vuelve al matching automatico", () => {
    const products = [product({ id: "p1", sku: "SML-0001", nombre: "X" })];
    const decisions: Record<string, BulkImageDecision> = { a: { manualProductId: null } };
    const rows = matchBulkProductImages([file({ fileId: "a", fileName: "SML-0001.jpg" })], products, decisions);
    expect(rows[0].status).toBe("MATCHED_BY_SKU");
  });

  it("excluir un archivo duplicado deja al otro pasar el matching normal", () => {
    const products = [product({ id: "p1", sku: "SML-0001", nombre: "X" })];
    const decisions: Record<string, BulkImageDecision> = { a: { excluded: true } };
    const files = [
      file({ fileId: "a", fileName: "SML-0001.jpg" }),
      file({ fileId: "b", fileName: "SML-0001.jpg" })
    ];
    const rows = matchBulkProductImages(files, products, decisions);
    const rowA = rows.find((row) => row.fileId === "a")!;
    const rowB = rows.find((row) => row.fileId === "b")!;
    expect(rowA.status).toBe("EXCLUDED");
    expect(rowB.status).toBe("MATCHED_BY_SKU");
  });
});

describe("matchBulkProductImages - producto con imagen existente", () => {
  it("producto con imagen existente queda ALREADY_HAS_IMAGE con accion SKIP por defecto", () => {
    const products = [product({ id: "p1", sku: "SML-0001", nombre: "X", imageUrl: "https://x/imagen.webp" })];
    const rows = matchBulkProductImages([file({ fileName: "SML-0001.jpg" })], products);
    expect(rows[0].status).toBe("ALREADY_HAS_IMAGE");
    expect(rows[0].action).toBe("SKIP");
    expect(rows[0].ready).toBe(false);
    expect(rows[0].blocking).toBe(false);
  });

  it("reemplazo solicitado pero no autorizado globalmente bloquea la confirmacion", () => {
    const products = [
      product({
        id: "p1",
        sku: "SML-0001",
        nombre: "X",
        imageUrl: "https://x/imagen.webp",
        imageStoragePath: "products/p1/old.webp"
      })
    ];
    const decisions: Record<string, BulkImageDecision> = { a: { replaceRequested: true } };
    const rows = matchBulkProductImages([file({ fileId: "a", fileName: "SML-0001.jpg" })], products, decisions, {
      globalReplaceAuthorized: false
    });
    expect(rows[0].blocking).toBe(true);
    expect(rows[0].ready).toBe(false);
    expect(rows[0].expectedImageStoragePath).toBe("products/p1/old.webp");
  });

  it("reemplazo solicitado y autorizado globalmente queda listo, con expectedImageStoragePath capturado", () => {
    const products = [
      product({
        id: "p1",
        sku: "SML-0001",
        nombre: "X",
        imageUrl: "https://x/imagen.webp",
        imageStoragePath: "products/p1/old.webp"
      })
    ];
    const decisions: Record<string, BulkImageDecision> = { a: { replaceRequested: true } };
    const rows = matchBulkProductImages([file({ fileId: "a", fileName: "SML-0001.jpg" })], products, decisions, {
      globalReplaceAuthorized: true
    });
    expect(rows[0].status).toBe("ALREADY_HAS_IMAGE");
    expect(rows[0].action).toBe("REPLACE");
    expect(rows[0].ready).toBe(true);
    expect(rows[0].blocking).toBe(false);
    expect(rows[0].expectedImageStoragePath).toBe("products/p1/old.webp");
  });

  it("reemplazo solicitado y autorizado, pero SIN imageStoragePath (URL externa sin ruta administrada), nunca queda listo", () => {
    const products = [
      product({ id: "p1", sku: "SML-0001", nombre: "X", imageUrl: "https://cdn.externo.com/foto.jpg" })
    ];
    const decisions: Record<string, BulkImageDecision> = { a: { replaceRequested: true } };
    const rows = matchBulkProductImages([file({ fileId: "a", fileName: "SML-0001.jpg" })], products, decisions, {
      globalReplaceAuthorized: true
    });
    expect(rows[0].ready).toBe(false);
    expect(rows[0].blocking).toBe(true);
    expect(rows[0].expectedImageStoragePath).toBeNull();
    expect(rows[0].warnings.some((w) => w.includes("falta la ruta"))).toBe(true);
  });
});

describe("matchBulkProductImages - archivo invalido", () => {
  it("archivo invalido queda INVALID_FILE y bloquea", () => {
    const products = [product({ id: "p1", sku: "SML-0001", nombre: "X" })];
    const rows = matchBulkProductImages(
      [file({ fileName: "SML-0001.gif", mimeType: "image/gif" })],
      products
    );
    expect(rows[0].status).toBe("INVALID_FILE");
    expect(rows[0].blocking).toBe(true);
  });
});

describe("canConfirmBulkUpload", () => {
  it("false si no hay ninguna fila lista", () => {
    expect(canConfirmBulkUpload([])).toBe(false);
  });

  it("true si hay al menos una fila lista y ninguna bloqueante", () => {
    const products = [product({ id: "p1", sku: "SML-0001", nombre: "X" })];
    const rows = matchBulkProductImages([file({ fileName: "SML-0001.jpg" })], products);
    expect(canConfirmBulkUpload(rows)).toBe(true);
  });

  it("las filas excluidas no bloquean aunque el resto este listo", () => {
    const products = [product({ id: "p1", sku: "SML-0001", nombre: "X" })];
    const decisions: Record<string, BulkImageDecision> = { b: { excluded: true } };
    const files = [
      file({ fileId: "a", fileName: "SML-0001.jpg" }),
      file({ fileId: "b", fileName: "sin-match.jpg" })
    ];
    const rows = matchBulkProductImages(files, products, decisions);
    expect(canConfirmBulkUpload(rows)).toBe(true);
  });
});
