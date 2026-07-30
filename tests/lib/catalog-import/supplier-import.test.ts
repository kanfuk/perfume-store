import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  detectImportProfile,
  parseSupplierCsv,
  validateMarkupPercentage,
  calculateSalePrice,
  buildSupplierImportPlan,
  buildSupplierImportPreview,
  DEFAULT_MARKUP_PERCENTAGE
} from "@/lib/catalog-import/supplier-import.ts";

const FIXTURES_DIR = path.join(process.cwd(), "tests", "fixtures", "catalog-import");
const HEADER = "Perfume;Marca;Contenido;Precio Compra";

function csv(...rows: string[]): Buffer {
  return Buffer.from([HEADER, ...rows].join("\n"), "utf8");
}

describe("supplier-import - detectImportProfile", () => {
  it("detecta el perfil de proveedor por encabezados exactos", () => {
    expect(detectImportProfile(["Perfume", "Marca", "Contenido", "Precio Compra"])).toBe("proveedor");
  });

  it("detecta el perfil de proveedor con variaciones razonables de encabezado", () => {
    expect(detectImportProfile(["Perfume", "Marca", "Contenido", "precio compra"])).toBe("proveedor");
    expect(detectImportProfile(["Perfume", "Marca", "Contenido", "PrecioCompra"])).toBe("proveedor");
    expect(detectImportProfile(["Perfume", "Marca", "Contenido", "precio_compra"])).toBe("proveedor");
    expect(detectImportProfile(["Perfume", "Marca", "Contenido", "Costo"])).toBe("proveedor");
    expect(detectImportProfile(["Perfume", "Marca", "Contenido", "Costo Unitario"])).toBe("proveedor");
    expect(detectImportProfile(["Perfume", "Marca", "Contenido", "costo_unitario"])).toBe("proveedor");
  });

  it("detecta el perfil canonico cuando hay sku y nombre", () => {
    expect(detectImportProfile(["sku", "nombre", "marca", "contenido"])).toBe("canonico");
  });

  it("retorna null cuando no reconoce ningun perfil (no adivina)", () => {
    expect(detectImportProfile(["foo", "bar", "baz"])).toBeNull();
  });
});

describe("supplier-import - parseSupplierCsv", () => {
  it("acepta el archivo sin columna sku (no la exige)", () => {
    const result = parseSupplierCsv(csv("La Bomba;Carolina Herrera;80ML;58000"));
    expect(result.globalErrors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
  });

  it("acepta el archivo sin columna 'nombre' tecnica (usa 'Perfume')", () => {
    const result = parseSupplierCsv(csv("La Bomba;Carolina Herrera;80ML;58000"));
    expect(result.rows[0].perfume).toBe("La Bomba");
  });

  it("mapea Perfume -> nombre (perfume) y Precio Compra -> costo (precioCompra), nunca a precio de venta", () => {
    const result = parseSupplierCsv(csv("La Bomba;Carolina Herrera;80ML;58000"));
    expect(result.rows[0]).toMatchObject({
      perfume: "La Bomba",
      marca: "Carolina Herrera",
      contenido: "80ML",
      precioCompra: 58000
    });
    expect(result.rows[0]).not.toHaveProperty("precioVenta");
  });

  it("rechaza fila sin Perfume, informando fila y motivo", () => {
    const result = parseSupplierCsv(csv(";Carolina Herrera;80ML;58000"));
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].rowNumber).toBe(2);
    expect(result.errors[0].message).toMatch(/Falta Perfume/);
  });

  it("rechaza fila sin Marca", () => {
    const result = parseSupplierCsv(csv("La Bomba;;80ML;58000"));
    expect(result.errors[0].message).toMatch(/Falta Marca/);
  });

  it("rechaza fila sin Contenido", () => {
    const result = parseSupplierCsv(csv("La Bomba;Carolina Herrera;;58000"));
    expect(result.errors[0].message).toMatch(/Falta Contenido/);
  });

  it("rechaza fila con Precio Compra invalido o ausente", () => {
    const sinCosto = parseSupplierCsv(csv("La Bomba;Carolina Herrera;80ML;"));
    expect(sinCosto.errors[0].message).toMatch(/Precio Compra válido/);

    const costoTexto = parseSupplierCsv(csv("La Bomba;Carolina Herrera;80ML;no-es-numero"));
    expect(costoTexto.errors[0].message).toMatch(/Precio Compra válido/);

    const costoCero = parseSupplierCsv(csv("La Bomba;Carolina Herrera;80ML;0"));
    expect(costoCero.errors[0].message).toMatch(/mayor que 0/);
  });

  it("ignora filas completamente vacias sin contarlas como utiles", () => {
    const result = parseSupplierCsv(csv(";;;", "La Bomba;Carolina Herrera;80ML;58000"));
    expect(result.filasVacias).toBe(1);
    expect(result.rows).toHaveLength(1);
  });

  it("detecta correctamente un archivo real en Windows-1252 con punto y coma (fixture)", () => {
    const buffer = readFileSync(path.join(FIXTURES_DIR, "proveedor-cp1252-semicolon.csv"));
    const result = parseSupplierCsv(buffer);
    expect(result.globalErrors).toHaveLength(0);
    expect(result.rows.map((r) => r.perfume)).toEqual(["Sí passion", "Léau dissey"]);
  });

  it("detecta correctamente un archivo UTF-8 con punto y coma (fixture)", () => {
    const buffer = readFileSync(path.join(FIXTURES_DIR, "proveedor-utf8-semicolon.csv"));
    const result = parseSupplierCsv(buffer);
    expect(result.globalErrors).toHaveLength(0);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].perfume).toBe("La Bomba");
  });

  it("acepta UTF-8 con BOM", () => {
    const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), csv("La Bomba;Carolina Herrera;80ML;58000")]);
    const result = parseSupplierCsv(withBom);
    expect(result.globalErrors).toHaveLength(0);
    expect(result.rows[0].perfume).toBe("La Bomba");
  });

  it("acepta delimitador coma", () => {
    const buffer = Buffer.from("Perfume,Marca,Contenido,Precio Compra\nLa Bomba,Carolina Herrera,80ML,58000", "utf8");
    const result = parseSupplierCsv(buffer);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].precioCompra).toBe(58000);
  });
});

describe("supplier-import - validateMarkupPercentage", () => {
  it("acepta el valor por defecto (35)", () => {
    expect(validateMarkupPercentage(DEFAULT_MARKUP_PERCENTAGE)).toEqual({ value: 35, error: null });
  });

  it("acepta porcentaje 0", () => {
    expect(validateMarkupPercentage(0)).toEqual({ value: 0, error: null });
  });

  it("rechaza porcentaje negativo", () => {
    const result = validateMarkupPercentage(-1);
    expect(result.value).toBeNull();
    expect(result.error).toMatch(/no puede ser negativo/);
  });

  it("rechaza porcentaje superior a 300", () => {
    const result = validateMarkupPercentage(301);
    expect(result.value).toBeNull();
    expect(result.error).toMatch(/no puede superar 300/);
  });

  it("acepta exactamente el limite de 300", () => {
    expect(validateMarkupPercentage(300).error).toBeNull();
  });

  it("nunca confia en el tipo recibido: rechaza NaN/strings no numericas", () => {
    expect(validateMarkupPercentage("no-es-numero").error).not.toBeNull();
    expect(validateMarkupPercentage(undefined).error).not.toBeNull();
    expect(validateMarkupPercentage(NaN).error).not.toBeNull();
  });
});

describe("supplier-import - calculateSalePrice", () => {
  it("caso obligatorio: costo 58000 + 35% = 78300", () => {
    expect(calculateSalePrice(58000, 35)).toBe(78300);
  });

  it("porcentaje 0 deja el precio igual al costo", () => {
    expect(calculateSalePrice(58000, 0)).toBe(58000);
  });

  it("redondea al entero mas cercano", () => {
    expect(calculateSalePrice(100, 33)).toBe(133);
  });
});

const NO_EXISTING = new Map<string, { modoPrecio: "AUTO" | "MANUAL"; precioVenta: number }>();

describe("supplier-import - buildSupplierImportPlan / SKU", () => {
  it("genera SKU automaticamente con el motor determinista existente", () => {
    const parsed = parseSupplierCsv(csv("La Bomba;Carolina Herrera;80ML;58000"));
    const { plan } = buildSupplierImportPlan(parsed.rows, 35, NO_EXISTING);
    expect(plan[0].sku).toBe("SML-CAROLINA-HERRERA-LA-BOMBA-80ML");
  });

  it("el SKU es estable entre ejecuciones para el mismo input", () => {
    const parsed = parseSupplierCsv(csv("La Bomba;Carolina Herrera;80ML;58000"));
    const run1 = buildSupplierImportPlan(parsed.rows, 35, NO_EXISTING);
    const run2 = buildSupplierImportPlan(parsed.rows, 35, NO_EXISTING);
    expect(run1.plan[0].sku).toBe(run2.plan[0].sku);
  });

  it("clasifica CREAR cuando el SKU no existe aun (modo AUTO)", () => {
    const parsed = parseSupplierCsv(csv("La Bomba;Carolina Herrera;80ML;58000"));
    const { plan } = buildSupplierImportPlan(parsed.rows, 35, NO_EXISTING);
    expect(plan[0].action).toBe("CREAR");
    expect(plan[0].modoPrecio).toBe("AUTO");
    expect(plan[0].precioVentaFinal).toBe(plan[0].precioVentaSugerido);
  });

  it("clasifica ACTUALIZAR cuando el SKU ya existe en el catalogo remoto", () => {
    const parsed = parseSupplierCsv(csv("La Bomba;Carolina Herrera;80ML;58000"));
    const existing = new Map([
      ["SML-CAROLINA-HERRERA-LA-BOMBA-80ML", { modoPrecio: "AUTO" as const, precioVenta: 70000 }]
    ]);
    const { plan } = buildSupplierImportPlan(parsed.rows, 35, existing);
    expect(plan[0].action).toBe("ACTUALIZAR");
  });

  it("producto existente AUTO: recalcula el precio con el recargo vigente", () => {
    const parsed = parseSupplierCsv(csv("La Bomba;Carolina Herrera;80ML;58000"));
    const existing = new Map([
      ["SML-CAROLINA-HERRERA-LA-BOMBA-80ML", { modoPrecio: "AUTO" as const, precioVenta: 999 }]
    ]);
    const { plan } = buildSupplierImportPlan(parsed.rows, 35, existing);
    expect(plan[0].precioVentaFinal).toBe(78300);
    expect(plan[0].modoPrecio).toBe("AUTO");
  });

  it("producto existente MANUAL: preserva el precio manual, muestra el sugerido como referencia", () => {
    const parsed = parseSupplierCsv(csv("La Bomba;Carolina Herrera;80ML;58000"));
    const existing = new Map([
      ["SML-CAROLINA-HERRERA-LA-BOMBA-80ML", { modoPrecio: "MANUAL" as const, precioVenta: 65000 }]
    ]);
    const { plan } = buildSupplierImportPlan(parsed.rows, 35, existing);
    expect(plan[0].precioVentaFinal).toBe(65000); // preservado, NUNCA sobrescrito
    expect(plan[0].precioVentaSugerido).toBe(78300); // referencia informativa
    expect(plan[0].modoPrecio).toBe("MANUAL");
  });

  it("bloquea filas cuyo SKU quedaria duplicado dentro del mismo archivo", () => {
    const parsed = parseSupplierCsv(
      csv("La Bomba;Carolina Herrera;80ML;58000", "La Bomba;Carolina Herrera;80ML;60000")
    );
    const { plan, duplicateErrors } = buildSupplierImportPlan(parsed.rows, 35, NO_EXISTING);
    expect(plan).toHaveLength(1);
    expect(duplicateErrors).toHaveLength(1);
    expect(duplicateErrors[0].message).toMatch(/SKU duplicado/);
  });
});

describe("supplier-import - buildSupplierImportPreview (integracion)", () => {
  it("preview completo: filas, sku, costo y precio calculado", () => {
    const buffer = csv(
      "La Bomba;Carolina Herrera;80ML;58000",
      "Aqua di Gio Profondo;Giorgio Armani;125ML;65000"
    );
    const preview = buildSupplierImportPreview(buffer, 35, NO_EXISTING);

    expect(preview.perfil).toBe("proveedor");
    expect(preview.porcentajeAplicado).toBe(35);
    expect(preview.filasUtiles).toBe(2);
    expect(preview.resumen).toEqual({ crear: 2, actualizar: 0, bloqueado: 0 });
    expect(preview.plan[0].precioVentaFinal).toBe(78300);
    expect(preview.plan[1].precioVentaFinal).toBe(87750);
  });

  it("un porcentaje invalido bloquea el preview completo (error global, no por fila)", () => {
    const buffer = csv("La Bomba;Carolina Herrera;80ML;58000");
    const preview = buildSupplierImportPreview(buffer, -10, NO_EXISTING);
    expect(preview.erroresGlobales[0]).toMatch(/no puede ser negativo/);
    expect(preview.plan).toHaveLength(0);
  });
});
