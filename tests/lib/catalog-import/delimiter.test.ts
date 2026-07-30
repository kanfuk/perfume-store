import { describe, expect, it } from "vitest";
import { detectDelimiter } from "@/lib/catalog-import/delimiter.ts";

describe("catalog-import/delimiter", () => {
  it("detecta punto y coma", () => {
    expect(detectDelimiter("Perfume;Marca;Contenido\nfila1;fila2;fila3")).toBe(";");
  });

  it("detecta coma", () => {
    expect(detectDelimiter("Perfume,Marca,Contenido\nfila1,fila2,fila3")).toBe(",");
  });

  it("detecta tabulador", () => {
    expect(detectDelimiter("Perfume\tMarca\tContenido")).toBe("\t");
  });

  it("ignora delimitadores dentro de comillas al contar", () => {
    const text = 'Perfume;Marca;Contenido\n"Uno, dos";Marca;100ml';
    expect(detectDelimiter(text)).toBe(";");
  });

  it("usa la primera linea no vacia para decidir", () => {
    expect(detectDelimiter("\n\nPerfume;Marca")).toBe(";");
  });
});
