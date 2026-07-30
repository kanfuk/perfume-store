import { describe, expect, it } from "vitest";
import { parseCsvLines, parseJulioRows, parseJunioRows } from "@/lib/catalog-import/parser.ts";

describe("catalog-import/parser - parseCsvLines", () => {
  it("parsea campos separados por punto y coma", () => {
    const rows = parseCsvLines("a;b;c\n1;2;3", ";");
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"]
    ]);
  });

  it("respeta comillas con delimitador embebido", () => {
    const rows = parseCsvLines('"Uno, dos",Marca,100ml', ",");
    expect(rows[0]).toEqual(["Uno, dos", "Marca", "100ml"]);
  });

  it("des-escapa comillas dobles dentro de un campo entrecomillado", () => {
    const rows = parseCsvLines('"Eau de parfum ""Y"" ";Marca;100ml', ";");
    expect(rows[0][0]).toBe('Eau de parfum "Y" ');
  });
});

describe("catalog-import/parser - parseJulioRows", () => {
  it("extrae perfume, marca, contenido y precio de compra", () => {
    const csv = "Perfume;Marca;Contenido; Precio Compra ;;;;;;\nLa Bomba;Carolina Herrera;80 ml; $65.000 ;;;;;;";
    const result = parseJulioRows(csv, ";");
    expect(result.filasUtiles).toBe(1);
    expect(result.rows[0]).toMatchObject({
      perfume: "La Bomba",
      marca: "Carolina Herrera",
      contenido: "80 ml",
      precioCompra: 65000
    });
  });

  it("ignora filas completamente vacias sin contarlas como utiles", () => {
    const csv = "Perfume;Marca;Contenido;Precio Compra\n;;;\nLa Bomba;Carolina Herrera;80ml;$65.000";
    const result = parseJulioRows(csv, ";");
    expect(result.filasVacias).toBe(1);
    expect(result.filasUtiles).toBe(1);
  });

  it("ignora filas de relleno de Excel con residuo en columnas no usadas", () => {
    const csv = "Perfume;Marca;Contenido;Precio Compra;;;;;;\n;;;;;;;;;0";
    const result = parseJulioRows(csv, ";");
    expect(result.filasVacias).toBe(1);
    expect(result.filasUtiles).toBe(0);
  });
});

describe("catalog-import/parser - parseJunioRows", () => {
  it("extrae costo unitario y precio de venta por separado", () => {
    const csv =
      "Perfume;Marca;Contenido; Costo Unitario ; Precio Venta ;;;;;Ganancia\nLa Bomba;Carolina Herrera;80ml; $45.000 ; $65.000 ;;;;;20000";
    const result = parseJunioRows(csv, ";");
    expect(result.rows[0]).toMatchObject({
      costoUnitario: 45000,
      precioVenta: 65000
    });
  });

  it("deja precio_venta indefinido cuando la celda esta vacia (no usa 0)", () => {
    const csv = "Perfume;Marca;Contenido;Costo Unitario;Precio Venta\nLady million;Paco Rabanne;30 ml; $15.000 ;";
    const result = parseJunioRows(csv, ";");
    expect(result.rows[0].precioVenta).toBeUndefined();
    expect(result.rows[0].costoUnitario).toBe(15000);
  });

  it("marca fila con nombre pero sin marca/contenido como fila util (la invalidacion ocurre en reconciliacion)", () => {
    const csv = "Perfume;Marca;Contenido;Costo Unitario;Precio Venta\nligth blue pour homme;;;;;;;;;0";
    const result = parseJunioRows(csv, ";");
    expect(result.filasUtiles).toBe(1);
    expect(result.rows[0].marca).toBe("");
  });
});
