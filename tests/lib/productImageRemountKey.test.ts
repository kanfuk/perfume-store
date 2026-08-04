import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Regresion: la correccion anterior (key={currentSrc} solo en el <Image>
 * interno) resulto INSUFICIENTE -- el estado de error/reintentos vive en
 * ProductImageInstance, y una key en un elemento INTERNO no evita que React
 * reutilice esa instancia (con su estado) cuando un consumidor (ej.
 * CatalogControlCenter -> ImageCellEditor) renderiza `<ProductImage>` en la
 * MISMA posicion del arbol para dos `src` distintos dentro de la misma rama
 * de un ternario (preview local en blob: -> URL real ya subida). La
 * correccion real es que el WRAPPER externo (ProductImage) tenga la key,
 * forzando el remount de TODA la instancia con estado (ProductImageInstance)
 * cada vez que `src` cambia. Se verifica por inspeccion de codigo fuente (no
 * hay jsdom/RTL en este proyecto) porque es una garantia estructural sobre
 * COMO se declara el arbol de componentes, no sobre datos.
 */
const source = readFileSync("components/ProductImage.tsx", "utf8");

describe("ProductImage: wrapper delgado con key={src} remonta toda la instancia con estado", () => {
  it("existen dos funciones distintas: ProductImage (wrapper) y ProductImageInstance (estado)", () => {
    expect(source).toMatch(/export function ProductImage\(/);
    expect(source).toMatch(/function ProductImageInstance\(/);
  });

  it("ProductImage no declara useState/useReducer propio: es un wrapper sin estado", () => {
    const wrapperStart = source.indexOf("export function ProductImage(");
    const wrapperEnd = source.indexOf("function ProductImageInstance(");
    const wrapperBody = source.slice(wrapperStart, wrapperEnd);
    expect(wrapperBody).not.toMatch(/useState|useReducer/);
  });

  it("ProductImage renderiza ProductImageInstance con key derivada de src (no un key fijo)", () => {
    const wrapperStart = source.indexOf("export function ProductImage(");
    const wrapperEnd = source.indexOf("function ProductImageInstance(");
    const wrapperBody = source.slice(wrapperStart, wrapperEnd);
    expect(wrapperBody).toMatch(/<ProductImageInstance key=\{key\}/);
  });

  it("el estado de error/reintentos (useReducer) vive dentro de ProductImageInstance, no en ProductImage", () => {
    const instanceStart = source.indexOf("function ProductImageInstance(");
    const instanceBody = source.slice(instanceStart);
    expect(instanceBody).toMatch(/useReducer\(imageLoadReducer/);
  });
});
