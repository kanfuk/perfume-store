import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Diagnostico confirmado (fix/critical-issues-q3-2026, imagenes de producto
 * "guardadas pero no visualizables"): la CSP NO es la causa. `curl -sI` al
 * Preview real muestra que `img-src` ya incluye `https:` de forma amplia (no
 * un origen especifico), lo que YA permite cualquier host https, incluido
 * Supabase Storage -- coincide exactamente con next.config.ts y con
 * `images.remotePatterns: [{ hostname: "**" }]`. La causa real fue que el
 * optimizador /_next/image de Next.js (no la CSP del navegador) rechaza el
 * fetch server-side contra el bucket administrado -- ver
 * lib/product-image-render.ts. Este test fija como regresion que la CSP
 * siga permitiendo Supabase en img-src/connect-src y no se angoste ni se
 * ensanche a un wildcard inseguro (`*`) por error en un cambio futuro.
 */
const source = readFileSync("next.config.ts", "utf8");

function directive(name: string): string {
  const match = source.match(new RegExp(`"${name} ([^"]*)"`));
  expect(match, `directiva ${name} no encontrada en next.config.ts`).not.toBeNull();
  return match![1];
}

describe("next.config.ts: Content-Security-Policy permite cargar imagenes de Supabase Storage", () => {
  it("img-src conserva 'self', data: y blob: (no solo https:)", () => {
    const imgSrc = directive("img-src");
    expect(imgSrc).toMatch(/'self'/);
    expect(imgSrc).toMatch(/data:/);
    expect(imgSrc).toMatch(/blob:/);
  });

  it("img-src permite https: de forma amplia, cubriendo el host de Supabase Storage sin necesidad de enumerarlo", () => {
    const imgSrc = directive("img-src");
    expect(imgSrc).toMatch(/(^|\s)https:(\s|$)/);
  });

  it("connect-src incluye explicitamente los origenes de Supabase (http y websocket realtime)", () => {
    const connectSrc = directive("connect-src");
    expect(connectSrc).toMatch(/https:\/\/\*\.supabase\.co/);
    expect(connectSrc).toMatch(/wss:\/\/\*\.supabase\.co/);
    expect(connectSrc).toMatch(/'self'/);
  });

  it("ninguna directiva usa un wildcard total ('*' aislado) que anule el resto de la politica", () => {
    for (const line of source.split("\n")) {
      expect(line).not.toMatch(/"\*"/);
      expect(line.trim()).not.toBe("*");
    }
  });
});
