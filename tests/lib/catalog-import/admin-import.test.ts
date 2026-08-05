import { describe, expect, it } from "vitest";
import {
  parseAdminImportCsv,
  validateAdminImportRows,
  buildImportPlan,
  buildAdminImportPreview,
  validateFileSize,
  validateFileNameExtension,
  validateBinaryContent,
  type AdminImportRow
} from "@/lib/catalog-import/admin-import.ts";
import { TOP_PRODUCTS_LIMIT } from "@/lib/constants.ts";

const HEADER =
  "sku,nombre,marca,contenido,costo_unitario,precio_venta,stock,activo,es_top,orden_destacado,es_oferta_semana,precio_anterior,image_url";

function csvOf(...rows: string[]): Buffer {
  return Buffer.from([HEADER, ...rows].join("\n"), "utf8");
}

describe("admin-import - validaciones de archivo", () => {
  it("rechaza archivos que superan el tamaño maximo", () => {
    expect(validateFileSize(3 * 1024 * 1024)).toMatch(/tamaño máximo/);
    expect(validateFileSize(1024)).toBeNull();
  });

  it("rechaza extensiones distintas de .csv", () => {
    expect(validateFileNameExtension("catalogo.xlsx")).toMatch(/\.csv/);
    expect(validateFileNameExtension("catalogo.CSV")).toBeNull();
  });

  it("rechaza contenido binario disfrazado de CSV", () => {
    const binary = Buffer.from([0x00, 0x01, 0x02, 0x03]);
    expect(validateBinaryContent(binary)).toMatch(/no parece/);
    expect(validateBinaryContent(Buffer.from("sku,nombre\n1,a", "utf8"))).toBeNull();
  });
});

describe("admin-import - parseAdminImportCsv", () => {
  it("parsea filas validas con todos los campos", () => {
    const buffer = csvOf("SML-1,La Bomba,Carolina Herrera,80ML,45000,65000,5,true,false,,false,,");
    const result = parseAdminImportCsv(buffer);
    expect(result.globalErrors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      sku: "SML-1",
      nombre: "La Bomba",
      precioVenta: 65000,
      stock: 5,
      activo: true
    });
  });

  it("reporta error global cuando faltan columnas requeridas", () => {
    const buffer = Buffer.from("nombre,marca\nLa Bomba,Carolina Herrera", "utf8");
    const result = parseAdminImportCsv(buffer);
    expect(result.globalErrors[0]).toMatch(/columnas requeridas/);
  });

  it("bloquea filas sin SKU o sin nombre", () => {
    const buffer = csvOf(",La Bomba,Carolina Herrera,80ML,,,,,,,,,", "SML-2,,Carolina Herrera,80ML,,,,,,,,,");
    const result = parseAdminImportCsv(buffer);
    expect(result.errors).toHaveLength(2);
    expect(result.rows).toHaveLength(0);
  });
});

function validRow(overrides: Partial<AdminImportRow> = {}): AdminImportRow {
  return {
    rowNumber: 2,
    sku: "SML-1",
    nombre: "La Bomba",
    marca: "Carolina Herrera",
    contenido: "80ML",
    costoUnitario: 45000,
    precioVenta: 65000,
    stock: 5,
    activo: true,
    esTop: false,
    ordenDestacado: null,
    esOfertaSemana: false,
    precioAnterior: null,
    imageUrl: "",
    ...overrides
  };
}

describe("admin-import - validateAdminImportRows", () => {
  it("rechaza SKU duplicado dentro del archivo", () => {
    const result = validateAdminImportRows([validRow(), validRow({ rowNumber: 3 })]);
    expect(result.valid).toHaveLength(1);
    expect(result.errors[0].message).toMatch(/SKU duplicado/);
  });

  it("rechaza stock negativo", () => {
    const result = validateAdminImportRows([validRow({ stock: -1, activo: false })]);
    expect(result.errors[0].message).toMatch(/stock no puede ser negativo/);
  });

  it("rechaza precio de venta negativo", () => {
    const result = validateAdminImportRows([validRow({ precioVenta: -100 })]);
    expect(result.errors[0].message).toMatch(/precio de venta no puede ser negativo/);
  });

  it("un producto activo exige precio y stock", () => {
    const sinPrecio = validateAdminImportRows([validRow({ precioVenta: null })]);
    expect(sinPrecio.errors[0].message).toMatch(/exige precio/);

    const sinStock = validateAdminImportRows([validRow({ stock: null })]);
    expect(sinStock.errors[0].message).toMatch(/exige stock/);

    const stockCero = validateAdminImportRows([validRow({ stock: 0 })]);
    expect(stockCero.errors[0].message).toMatch(/exige stock/);
  });

  it("acepta producto inactivo sin precio ni stock", () => {
    const result = validateAdminImportRows([
      validRow({ activo: false, precioVenta: null, stock: null })
    ]);
    expect(result.valid).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
  });

  it(`rechaza mas de ${TOP_PRODUCTS_LIMIT} productos destacados (maximo Top ${TOP_PRODUCTS_LIMIT})`, () => {
    const rows = Array.from({ length: TOP_PRODUCTS_LIMIT + 1 }, (_, i) =>
      validRow({ sku: `SML-${i}`, rowNumber: i + 2, esTop: true, ordenDestacado: (i % TOP_PRODUCTS_LIMIT) + 1 })
    );
    const result = validateAdminImportRows(rows);
    expect(result.globalErrors.some((e) => e.includes(`máximo permitido es ${TOP_PRODUCTS_LIMIT}`))).toBe(true);
  });

  it(`rechaza orden_destacado fuera de 1..${TOP_PRODUCTS_LIMIT} (ranking ${TOP_PRODUCTS_LIMIT + 1} rechazado)`, () => {
    const result = validateAdminImportRows([validRow({ esTop: true, ordenDestacado: TOP_PRODUCTS_LIMIT + 1 })]);
    expect(result.errors[0].message).toMatch(new RegExp(`entre 1 y ${TOP_PRODUCTS_LIMIT}`));
  });

  it("rechaza posiciones de orden_destacado duplicadas", () => {
    const rows = [
      validRow({ sku: "SML-A", esTop: true, ordenDestacado: 1 }),
      validRow({ sku: "SML-B", rowNumber: 3, esTop: true, ordenDestacado: 1 })
    ];
    const result = validateAdminImportRows(rows);
    expect(result.globalErrors.some((e) => e.includes("Posiciones de orden_destacado repetidas"))).toBe(true);
  });
});

describe("admin-import - buildImportPlan / preview", () => {
  it("clasifica CREAR cuando el SKU no existe en el catalogo remoto", () => {
    const plan = buildImportPlan([validRow()], new Set());
    expect(plan[0].action).toBe("CREAR");
  });

  it("clasifica ACTUALIZAR cuando el SKU ya existe", () => {
    const plan = buildImportPlan([validRow()], new Set(["SML-1"]));
    expect(plan[0].action).toBe("ACTUALIZAR");
  });

  it("buildAdminImportPreview es un dry-run: solo calcula, nunca escribe", () => {
    const buffer = csvOf("SML-1,La Bomba,Carolina Herrera,80ML,45000,65000,5,true,false,,false,,");
    const preview = buildAdminImportPreview(buffer, new Set());
    expect(preview.resumen).toEqual({ crear: 1, actualizar: 0, bloqueado: 0 });
    expect(preview.plan[0].action).toBe("CREAR");
  });
});
