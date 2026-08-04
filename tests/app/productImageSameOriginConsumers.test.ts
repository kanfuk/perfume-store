import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * QA manual: el navegador NO debe depender de Supabase Storage/Cloudflare
 * para ninguna imagen administrada, en NINGUN consumidor -- ni el catalogo
 * publico, ni el carrito, ni el Centro de productos, ni el formulario
 * manual, ni Top 12. Todos deben pasar por getProductImageRenderConfig
 * (directo o via ProductImage, que ya lo usa internamente). Sin jsdom/RTL en
 * este proyecto: se verifica por inspeccion de codigo fuente, el mismo
 * patron ya usado para el resto de este componente/feature.
 */
const CONSUMERS_VIA_PRODUCT_IMAGE = [
  "components/shared/ProductCard.tsx", // catalogo publico
  "components/shared/CartSummary.tsx", // carrito
  "components/admin/CatalogControlCenter.tsx" // Centro de productos
];

describe("Consumidores publicos/admin usan el ProductImage compartido (same-origin por construccion)", () => {
  it.each(CONSUMERS_VIA_PRODUCT_IMAGE)("%s importa ProductImage de @/components/ProductImage", (file) => {
    const source = readFileSync(file, "utf8");
    expect(source).toMatch(/from "@\/components\/ProductImage"/);
  });
});

describe("Top12AdminPanel: usa getProductImageRenderConfig para el <Image> de next/image (mismo pipeline same-origin)", () => {
  const source = readFileSync("components/admin/Top12AdminPanel.tsx", "utf8");

  it("importa getProductImageRenderConfig", () => {
    expect(source).toMatch(/from "@\/lib\/product-image-render"/);
  });

  it("el <Image> usa renderConfig.src y renderConfig.unoptimized, no slot.imageUrl directo", () => {
    expect(source).toMatch(/const renderConfig = getProductImageRenderConfig\(slot\.imageUrl\)/);
    expect(source).toMatch(/src=\{renderConfig\.src\}/);
    expect(source).toMatch(/unoptimized=\{renderConfig\.unoptimized\}/);
    expect(source).not.toMatch(/src=\{slot\.imageUrl\}/);
  });

  it("no modifica la logica editorial (unlink/rank/producto) alrededor del cambio", () => {
    expect(source).toMatch(/unlink\(slot\.rank\)/);
    expect(source).toMatch(/Quitar del Top 12/);
  });
});

describe("Ningun consumidor arma manualmente una URL de /_next/image apuntando a Supabase", () => {
  const files = [
    "components/ProductImage.tsx",
    "components/admin/Top12AdminPanel.tsx",
    "components/admin/CatalogControlCenter.tsx",
    "components/admin/dashboard/AddPerfumeModal.tsx",
    "components/shared/ProductCard.tsx",
    "components/shared/CartSummary.tsx"
  ];

  it.each(files)("%s no referencia supabase.co como src de imagen", (file) => {
    const source = readFileSync(file, "utf8");
    expect(source).not.toMatch(/src=.*supabase\.co/);
  });
});
