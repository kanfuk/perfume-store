import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Causa confirmada en el Preview real: /_next/image devuelve 400
 * INVALID_IMAGE_OPTIMIZE_REQUEST para el bucket administrado (Supabase
 * Storage detras de Cloudflare), mientras la misma URL carga sin problema
 * directo en el navegador. ProductImage debe evitar ese proxy roto SOLO para
 * imagenes administradas (unoptimized selectivo, via
 * getProductImageRenderConfig) -- nunca unoptimized global, que degradaria
 * innecesariamente imagenes externas no administradas que si dependen del
 * optimizador. Sin jsdom/RTL en este proyecto: se verifica por inspeccion de
 * codigo fuente, el mismo patron ya usado para el resto de este componente.
 */
const source = readFileSync("components/ProductImage.tsx", "utf8");

describe("ProductImage: unoptimized selectivo via getProductImageRenderConfig (no global)", () => {
  it("importa getProductImageRenderConfig como unica fuente de verdad del src/unoptimized", () => {
    expect(source).toMatch(/from "@\/lib\/product-image-render"/);
  });

  it("el <Image> usa el src y el unoptimized que devuelve getProductImageRenderConfig, no un valor fijo", () => {
    const instanceStart = source.indexOf("function ProductImageInstance(");
    const instanceBody = source.slice(instanceStart);
    expect(instanceBody).toMatch(/const renderConfig = getProductImageRenderConfig\(/);
    expect(instanceBody).toMatch(/src=\{renderConfig\.src\}/);
    expect(instanceBody).toMatch(/unoptimized=\{renderConfig\.unoptimized\}/);
  });

  it("no fija unoptimized a true de forma global/incondicional", () => {
    expect(source).not.toMatch(/unoptimized(?:\s*=\s*|:\s*)\{?true\}?/);
    expect(source).not.toMatch(/unoptimized\s*$/m);
  });

  it("ya no agrega parametros de cache-busting acumulativos a la URL (cada imagen ya trae UUID unico)", () => {
    expect(source).not.toMatch(/buildImageRetrySrc/);
    expect(source).not.toMatch(/retry=/);
  });
});
