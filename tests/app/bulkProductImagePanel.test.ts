import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Fase 7.3: verificacion por inspeccion de codigo fuente (sin jsdom/RTL en
 * este proyecto, mismo patron que el resto de la suite) de la herramienta de
 * carga masiva de imagenes -- ubicacion, reutilizacion del endpoint
 * individual, estado vacio, liberacion de object URLs y ausencia de una API
 * batch nueva.
 */
const panelSource = readFileSync("components/admin/BulkProductImagePanel.tsx", "utf8");
const catalogControlCenterSource = readFileSync("components/admin/CatalogControlCenter.tsx", "utf8");

describe("Ubicacion y navegacion", () => {
  it("la pagina /admin/catalogo/imagenes existe y renderiza BulkProductImagePanel", () => {
    expect(existsSync("app/admin/catalogo/imagenes/page.tsx")).toBe(true);
    const page = readFileSync("app/admin/catalogo/imagenes/page.tsx", "utf8");
    expect(page).toMatch(/<BulkProductImagePanel/);
  });

  it("Productos (CatalogControlCenter) enlaza a la carga masiva de imagenes", () => {
    expect(catalogControlCenterSource).toMatch(/href="\/admin\/catalogo\/imagenes"/);
    expect(catalogControlCenterSource).toContain("Carga masiva de imágenes");
  });

  it("el panel ofrece un enlace claro para volver a Productos", () => {
    expect(panelSource).toMatch(/href="\/admin\/catalogo\/productos"/);
    expect(panelSource).toContain("Volver a Productos");
  });

  it("no se agrego ninguna entrada nueva en CATALOG_SECTIONS (no se llena el menu principal)", () => {
    const routes = readFileSync("lib/admin-catalog-routes.ts", "utf8");
    expect(routes).not.toMatch(/imagenes/);
  });
});

describe("Reutilizacion del endpoint individual (sin API batch nueva)", () => {
  it("sube cada imagen al endpoint individual ya validado", () => {
    expect(panelSource).toMatch(/\/api\/admin\/products\/\$\{job\.productId\}\/image/);
  });

  it("cada request usa FormData con un unico campo 'file' (una imagen por peticion)", () => {
    expect(panelSource).toMatch(/formData\.append\("file", file\)/);
    expect(panelSource).not.toMatch(/formData\.append\("files"/);
  });

  it("no crea ninguna ruta batch nueva bajo app/api", () => {
    expect(existsSync("app/api/admin/products/bulk-image")).toBe(false);
    expect(existsSync("app/api/admin/bulk-images")).toBe(false);
    expect(existsSync("app/api/admin/products/images-batch")).toBe(false);
  });

  it("la concurrencia maxima es la constante del proyecto (2), no un numero nuevo", () => {
    const constants = readFileSync("lib/constants.ts", "utf8");
    expect(constants).toMatch(/BULK_PRODUCT_IMAGE_MAX_CONCURRENCY = 2/);
    expect(constants).toMatch(/BULK_PRODUCT_IMAGE_MAX_FILES = 100/);
  });
});

describe("Estado vacio (catalogo productivo en cero)", () => {
  it("muestra el mensaje exacto exigido cuando no hay productos", () => {
    expect(panelSource).toContain("No hay productos disponibles para asociar imágenes.");
  });

  it("ofrece las CTA Ir a Productos e Importar catálogo", () => {
    expect(panelSource).toMatch(/Ir a Productos/);
    expect(panelSource).toMatch(/Importar catálogo/);
    expect(panelSource).toMatch(/href="\/admin\/catalogo\/productos"/);
    expect(panelSource).toMatch(/href="\/admin\/importar-catalogo"/);
  });

  it("con catalogo vacio nunca se habilita Confirmar (depende de canConfirmBulkUpload sobre las filas reales)", () => {
    expect(panelSource).toMatch(/disabled={!canConfirm}/);
  });
});

describe("Object URLs (seccion 16): liberadas en los 3 puntos exigidos", () => {
  it("revoca al quitar un archivo", () => {
    expect(panelSource).toMatch(/function removeFile[\s\S]{0,300}revokeObjectURL/);
  });

  it("revoca al limpiar la seleccion completa", () => {
    expect(panelSource).toMatch(/function clearSelection[\s\S]{0,300}revokeObjectURL/);
  });

  it("revoca al desmontar el componente", () => {
    expect(panelSource).toMatch(/return \(\) => \{[\s\S]{0,150}revokeObjectURL/);
  });

  it("nunca sube una imagen solo para generar el Preview (createObjectURL no viaja a fetch)", () => {
    // El unico uso de createObjectURL para miniaturas ocurre en handleFilesSelected,
    // nunca dentro de uploadOne (que es la unica funcion que llama a fetch con FormData).
    const uploadOneMatch = panelSource.match(/async function uploadOne[\s\S]*?\n  \}/);
    expect(uploadOneMatch?.[0] ?? "").not.toContain("createObjectURL");
  });
});

describe("Autorizacion de reemplazo (seccion 10): desactivada por defecto", () => {
  it("globalReplaceAuthorized inicia en false", () => {
    expect(panelSource).toMatch(/useState\(false\)/);
    expect(panelSource).toContain("globalReplaceAuthorized");
  });

  it("el checkbox de autorizacion global no viene marcado por defecto en el JSX", () => {
    expect(panelSource).toMatch(/checked=\{globalReplaceAuthorized\}/);
  });
});

describe("Sin retries automaticos, solo boton manual", () => {
  it("existe un boton explicito 'Reintentar fallidos'", () => {
    const summarySource = readFileSync("components/admin/bulk-images/BulkImageSummary.tsx", "utf8");
    expect(summarySource).toContain("Reintentar fallidos");
  });

  // El comportamiento real (un fallo nunca se reintenta solo, "Reintentar
  // fallidos" nunca reenvia exitos) ya esta verificado con ejecuciones reales
  // en tests/lib/product-image-bulk-queue.test.ts -- mas confiable que una
  // inspeccion de texto fuente para este caso.
});
