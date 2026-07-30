import { describe, expect, it } from "vitest";
import { detectEncoding, decodeBuffer } from "@/lib/catalog-import/encoding.ts";

describe("catalog-import/encoding", () => {
  it("detecta UTF-8 sin BOM", () => {
    const buffer = Buffer.from("Perfume;Marca;Contenido\nSí passion;Giorgio Armani;100 ml", "utf8");
    expect(detectEncoding(buffer)).toBe("utf-8");
  });

  it("detecta UTF-8 con BOM", () => {
    const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("Perfume;Marca", "utf8")]);
    expect(detectEncoding(withBom)).toBe("utf-8-bom");
  });

  it("detecta Windows-1252 cuando la secuencia de bytes no es UTF-8 valida", () => {
    // "Sí" en CP1252: 'S', 0xED ('í'), resto ascii. 0xED solo no forma una secuencia UTF-8 valida.
    const buffer = Buffer.from([0x53, 0xed, 0x20, 0x70, 0x61, 0x73, 0x73, 0x69, 0x6f, 0x6e]);
    expect(detectEncoding(buffer)).toBe("windows-1252");
  });

  it("decodifica UTF-8 con BOM removiendo el BOM", () => {
    const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("Perfume", "utf8")]);
    expect(decodeBuffer(withBom, "utf-8-bom")).toBe("Perfume");
  });

  it("decodifica Windows-1252 reconstruyendo tildes correctamente", () => {
    const buffer = Buffer.from([0x53, 0xed]); // 'S' + 0xED ('í' en CP1252/Latin-1)
    expect(decodeBuffer(buffer, "windows-1252")).toBe("Sí");
  });

  it("decodifica UTF-8 plano sin modificaciones", () => {
    const buffer = Buffer.from("Léau dissey", "utf8");
    expect(decodeBuffer(buffer, "utf-8")).toBe("Léau dissey");
  });
});
