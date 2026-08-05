import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Fase 7.4: verificacion por inspeccion de codigo fuente (mismo patron que
 * tests/app/bulkProductImagePanel.test.ts, sin jsdom/RTL en este proyecto)
 * de la regla canonica de imagen del Top 15, la confirmacion de reemplazo,
 * el Preview administrativo y el panel de Ofertas de la semana.
 */
const top12RouteSource = readFileSync("app/api/admin/top12/route.ts", "utf8");
const top12PanelSource = readFileSync("components/admin/Top12AdminPanel.tsx", "utf8");
const productoServiceSource = readFileSync("services/productoService.ts", "utf8");
const ofertasRouteSource = readFileSync("app/api/admin/ofertas/route.ts", "utf8");
const ofertasPanelSource = readFileSync("components/admin/OfertasAdminPanel.tsx", "utf8");
const bulkPanelSource = readFileSync("components/admin/BulkProductImagePanel.tsx", "utf8");

describe("Regla canonica de imagen del Top 15 (la imagen es del producto, no de la posicion)", () => {
  it("el endpoint /api/admin/top12 ya no importa el mapa curado por rank", () => {
    expect(top12RouteSource).not.toMatch(/import top12ImageMap/);
    expect(top12RouteSource).not.toMatch(/IMAGE_BY_RANK/);
  });

  it("GET resuelve la imagen del slot unicamente desde el producto vinculado", () => {
    expect(top12RouteSource).toMatch(/imageUrl:\s*slot\.producto\?\.imageUrl\s*\?\?\s*null/);
  });

  it("POST vincular ya no acepta ni reenvia una imageUrl (ni del cliente ni de un mapa curado)", () => {
    expect(top12RouteSource).toMatch(/vincularProductoTop12\(body\.rank,\s*body\.productId\)/);
  });

  it("vincularProductoTop12 en el servicio nunca escribe imageUrl", () => {
    const fnMatch = productoServiceSource.match(/async vincularProductoTop12\([\s\S]*?\n  \}/);
    expect(fnMatch).toBeTruthy();
    expect(fnMatch?.[0]).not.toMatch(/imageUrl/);
  });

  it("data/top12-image-map.json y los assets historicos siguen presentes pero sin consumo automatico", () => {
    expect(existsSync("data/top12-image-map.json")).toBe(true);
    expect(existsSync("public/images/perfumes/top12")).toBe(true);
  });
});

describe("Top 15: confirmacion antes de reemplazar una posicion ya asignada", () => {
  it("existe un estado de confirmacion que se activa solo al reemplazar un producto distinto", () => {
    expect(top12PanelSource).toContain("confirmingReplace");
    expect(top12PanelSource).toMatch(/activeSlot\?\.producto\s*&&\s*activeSlot\.producto\.id\s*!==\s*selectedProductId/);
  });

  it("el boton de confirmar cambia de texto en el segundo paso", () => {
    expect(top12PanelSource).toContain("Sí, reemplazar");
  });
});

describe("Top 15: Preview administrativo reutiliza el componente publico", () => {
  it("importa TopProductsSection en vez de reimplementar la grilla", () => {
    expect(top12PanelSource).toMatch(/import\s*\{\s*TopProductsSection\s*\}\s*from\s*"@\/components\/shared\/TopProductsSection"/);
  });

  it("consulta el mismo endpoint publico que la portada (/api/products)", () => {
    expect(top12PanelSource).toMatch(/fetchJson\("\/api\/products"\)/);
  });
});

describe("Ofertas de la semana: maximo de 10 y contador", () => {
  it("OFFERS_LIMIT es unica fuente del limite (10)", () => {
    const constants = readFileSync("lib/constants.ts", "utf8");
    expect(constants).toMatch(/export const OFFERS_LIMIT = 10;/);
  });

  it("activarOfertaSemana rechaza una oferta adicional al alcanzar OFFERS_LIMIT", () => {
    const fnMatch = productoServiceSource.match(/async activarOfertaSemana\([\s\S]*?\n  \}/);
    expect(fnMatch?.[0]).toMatch(/activas >= OFFERS_LIMIT/);
  });

  it("el panel muestra el contador X de OFFERS_LIMIT", () => {
    expect(ofertasPanelSource).toMatch(/Ofertas: \{ofertasCount\} de \{OFFERS_LIMIT\} seleccionadas/);
  });

  it("el panel bloquea agregar una oferta 11 cuando ya se alcanzo el maximo", () => {
    expect(ofertasPanelSource).toMatch(/disabled=\{pendingId === product\.id \|\| maxAlcanzado\}/);
  });
});

describe("Ofertas de la semana: precio anterior opcional, nunca inventado", () => {
  it("activarOfertaSemana solo escribe precioAnterior si se envio explicitamente", () => {
    const fnMatch = productoServiceSource.match(/async activarOfertaSemana\([\s\S]*?\n  \}/);
    expect(fnMatch?.[0]).toMatch(/precioAnterior !== undefined \? \{ precioAnterior \} : \{\}/);
  });

  it("el POST /api/admin/ofertas no exige precioAnterior en el body", () => {
    expect(ofertasRouteSource).not.toMatch(/precioAnterior.*required/i);
    expect(ofertasRouteSource).toMatch(/activarOfertaSemana\(body\.productId,\s*body\.precioAnterior\)/);
  });
});

describe("Ofertas de la semana: Preview administrativo reutiliza el componente publico", () => {
  it("importa OffersSection en vez de reimplementar la grilla", () => {
    expect(ofertasPanelSource).toMatch(/import\s*\{\s*OffersSection\s*\}\s*from\s*"@\/components\/shared\/OffersSection"/);
  });

  it("consulta el mismo endpoint publico que la portada (/api/products)", () => {
    expect(ofertasPanelSource).toMatch(/fetchJson\("\/api\/products"\)/);
  });
});

describe("Ofertas de la semana: producto compartido con Top 15 y catalogo (sin duplicar)", () => {
  it("no crea ninguna tabla ni servicio de 'ofertas' separado: usa AdminProductRecord existente", () => {
    expect(ofertasPanelSource).toMatch(/from "@\/lib\/types"/);
    expect(ofertasPanelSource).not.toMatch(/CREATE TABLE|nueva tabla/i);
  });

  it("no crea ninguna ruta batch nueva para ofertas", () => {
    expect(existsSync("app/api/admin/ofertas/bulk")).toBe(false);
    expect(existsSync("app/api/admin/ofertas-batch")).toBe(false);
  });
});

describe("Carga masiva de imagenes: SKU opcional, nombre = perfume del CSV", () => {
  it("el panel explica que el nombre del archivo debe ser el nombre del perfume del CSV", () => {
    expect(bulkPanelSource).toMatch(/mismo nombre\s*\n?\s*del perfume tal como aparece en el CSV/);
  });

  it("el panel aclara explicitamente que el SKU es opcional para nombrar archivos", () => {
    expect(bulkPanelSource).toMatch(/SKU.*opcional/);
  });

  it("no se modifico el motor de matching, la cola ni el endpoint individual (Fase 7.4 solo toca copy)", () => {
    expect(bulkPanelSource).toMatch(/\/api\/admin\/products\/\$\{job\.productId\}\/image/);
    const constants = readFileSync("lib/constants.ts", "utf8");
    expect(constants).toMatch(/BULK_PRODUCT_IMAGE_MAX_CONCURRENCY = 2/);
  });
});
