import { describe, expect, it } from "vitest";
import {
  buildManagedProductImagePrefix,
  buildSameOriginProductImageUrl,
  extractManagedProductImagePath,
  getProductImageRenderConfig,
  isManagedProductImageUrl
} from "@/lib/product-image-render";

/**
 * QA manual confirmo que el `unoptimized` selectivo sobre la URL PUBLICA de
 * Supabase era insuficiente: preloadImage() en el navegador seguia fallando
 * porque el navegador seguia dependiendo de una carga cruzada contra
 * Supabase Storage/Cloudflare. getProductImageRenderConfig ahora transforma
 * cada URL administrada en una ruta SAME-ORIGIN (`/api/product-images/...`,
 * ver app/api/product-images/[...path]/route.ts) -- el navegador nunca toca
 * el dominio externo. `originalSrc` preserva la URL tal como esta en DB
 * (nunca se migra ni se reescribe el registro persistido).
 */
const SUPABASE_URL = "https://example-project.supabase.co";
const MANAGED_PATH = "products/abc/uuid-1.webp";
const MANAGED_URL = `${SUPABASE_URL}/storage/v1/object/public/product-images/${MANAGED_PATH}`;

describe("buildManagedProductImagePrefix", () => {
  it("construye el prefijo exacto del bucket administrado", () => {
    expect(buildManagedProductImagePrefix(SUPABASE_URL)).toBe(
      "https://example-project.supabase.co/storage/v1/object/public/product-images/"
    );
  });

  it("tolera un URL de Supabase con barra final", () => {
    expect(buildManagedProductImagePrefix(`${SUPABASE_URL}/`)).toBe(
      "https://example-project.supabase.co/storage/v1/object/public/product-images/"
    );
  });

  it("sin URL de Supabase configurado, no hay prefijo", () => {
    expect(buildManagedProductImagePrefix(undefined)).toBeUndefined();
  });
});

describe("buildSameOriginProductImageUrl", () => {
  it("antepone /api/product-images/ y codifica cada segmento por separado", () => {
    expect(buildSameOriginProductImageUrl("products/producto con espacio/uuid.webp")).toBe(
      "/api/product-images/products/producto%20con%20espacio/uuid.webp"
    );
  });

  it("no codifica las barras del path como parte de un segmento (la ruta sigue teniendo 3 tramos)", () => {
    const url = buildSameOriginProductImageUrl(MANAGED_PATH);
    expect(url).toBe(`/api/product-images/${MANAGED_PATH}`);
    expect(url.split("/").filter(Boolean)).toHaveLength(5); // api, product-images, products, abc, uuid-1.webp
  });
});

describe("extractManagedProductImagePath", () => {
  it("extrae el path relativo de una URL administrada valida", () => {
    expect(extractManagedProductImagePath(MANAGED_URL, SUPABASE_URL)).toBe(MANAGED_PATH);
  });

  it("URL de otro proyecto de Supabase no se extrae", () => {
    expect(
      extractManagedProductImagePath(
        `https://otro-proyecto.supabase.co/storage/v1/object/public/product-images/${MANAGED_PATH}`,
        SUPABASE_URL
      )
    ).toBeNull();
  });

  it("URL del mismo proyecto pero de otro bucket no se extrae", () => {
    expect(
      extractManagedProductImagePath(`${SUPABASE_URL}/storage/v1/object/public/otro-bucket/${MANAGED_PATH}`, SUPABASE_URL)
    ).toBeNull();
  });

  it("URL externa no administrada no se extrae", () => {
    expect(extractManagedProductImagePath("https://cdn.example.com/foto.webp", SUPABASE_URL)).toBeNull();
  });

  it("un path con traversal despues del prefijo NO se extrae (revalida con isValidProductImageStoragePath)", () => {
    expect(
      extractManagedProductImagePath(
        `${SUPABASE_URL}/storage/v1/object/public/product-images/products/../secreto.webp`,
        SUPABASE_URL
      )
    ).toBeNull();
  });

  it("sin URL de Supabase configurado, nada se extrae", () => {
    expect(extractManagedProductImagePath(MANAGED_URL, undefined)).toBeNull();
  });
});

describe("isManagedProductImageUrl", () => {
  it("true para una URL administrada valida", () => {
    expect(isManagedProductImageUrl(MANAGED_URL, SUPABASE_URL)).toBe(true);
  });

  it("false para una URL externa", () => {
    expect(isManagedProductImageUrl("https://cdn.example.com/foto.webp", SUPABASE_URL)).toBe(false);
  });
});

describe("getProductImageRenderConfig: unica fuente de verdad para preloadImage y ProductImage", () => {
  it("imagen administrada: src same-origin, originalSrc preserva la URL de DB sin modificar", () => {
    expect(getProductImageRenderConfig(MANAGED_URL, SUPABASE_URL)).toEqual({
      originalSrc: MANAGED_URL,
      src: `/api/product-images/${MANAGED_PATH}`,
      isManagedStorageImage: true,
      unoptimized: true
    });
  });

  it("el src administrado NUNCA es la URL de Supabase (el navegador no debe depender de ella)", () => {
    const config = getProductImageRenderConfig(MANAGED_URL, SUPABASE_URL);
    expect(config.src).not.toMatch(/supabase\.co/);
    expect(config.src.startsWith("/api/product-images/")).toBe(true);
  });

  it("imagen externa no administrada: conserva el comportamiento normal (src = originalSrc, unoptimized false)", () => {
    const externalUrl = "https://cdn.example.com/foto.webp";
    expect(getProductImageRenderConfig(externalUrl, SUPABASE_URL)).toEqual({
      originalSrc: externalUrl,
      src: externalUrl,
      isManagedStorageImage: false,
      unoptimized: false
    });
  });

  it("URL vacia: originalSrc y src vacios, no administrada", () => {
    expect(getProductImageRenderConfig("", SUPABASE_URL)).toEqual({
      originalSrc: "",
      src: "",
      isManagedStorageImage: false,
      unoptimized: false
    });
  });

  it("unoptimized siempre coincide con isManagedStorageImage", () => {
    const managed = getProductImageRenderConfig(MANAGED_URL, SUPABASE_URL);
    const external = getProductImageRenderConfig("https://cdn.example.com/foto.webp", SUPABASE_URL);
    expect(managed.unoptimized).toBe(managed.isManagedStorageImage);
    expect(external.unoptimized).toBe(external.isManagedStorageImage);
  });
});
