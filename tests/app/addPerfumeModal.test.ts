import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Fase B: el formulario manual "Agregar perfume" (AddPerfumeModal.tsx). El
 * proyecto no tiene jsdom/React Testing Library, asi que las conductas de
 * interaccion (doble envio, conservar el producto creado si falla la
 * imagen) se verifican por inspeccion del codigo fuente -- el mismo patron
 * ya usado en el resto del proyecto para este tipo de prueba. La logica de
 * calculo (precio/margen) y de marca YA esta probada de verdad (no por
 * inspeccion) en tests/lib/product-pricing.test.ts y product-brand.test.ts.
 */
const source = readFileSync("components/admin/dashboard/AddPerfumeModal.tsx", "utf8");

describe("AddPerfumeModal: imagen por archivo, no por ruta manual", () => {
  it("no existe un campo de texto para escribir una URL/ruta de imagen manual", () => {
    expect(source).not.toMatch(/placeholder="https:\/\/\.\.\. o \/images/);
    expect(source).not.toMatch(/Ruta pública de imagen/);
  });

  it("usa un input type=file (selector de archivo) para la imagen", () => {
    expect(source).toMatch(/type="file"/);
    expect(source).toMatch(/accept="image\/jpeg,image\/png,image\/webp,image\/avif"/);
  });

  it("ofrece reemplazar archivo y quitar selección", () => {
    expect(source).toMatch(/Reemplazar archivo/);
    expect(source).toMatch(/Quitar selección/);
  });

  it("reutiliza el pipeline unico de imagenes (mismo endpoint que el resto del admin), no un segundo procesador", () => {
    expect(source).toMatch(/\/api\/admin\/products\/\$\{productId\}\/image/);
    expect(source).not.toMatch(/processProductImage|sharp\(/); // no reimplementa el procesamiento en el cliente
  });
});

describe("AddPerfumeModal: verificacion real en el navegador antes de anunciar exito (mismo pipeline que CatalogControlCenter)", () => {
  const uploadBody = (() => {
    const start = source.indexOf("async function uploadSelectedImage(");
    const end = source.indexOf("async function handleSubmit()");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return source.slice(start, end);
  })();

  it("hace una relectura GET fresca (cache: no-store) de /api/admin/products antes de decidir exito", () => {
    expect(uploadBody).toMatch(/fetchJson\("\/api\/admin\/products",\s*\{\s*cache:\s*"no-store"\s*\}\)/);
  });

  it("compara la relectura contra lo subido con productHasExpectedImage antes de continuar", () => {
    expect(uploadBody).toMatch(/productHasExpectedImage\(latest,/);
  });

  it("precarga con preloadImage el MISMO src que renderizara ProductImage (getProductImageRenderConfig), nunca una URL distinta", () => {
    expect(uploadBody).toMatch(/preloadImage\(getProductImageRenderConfig\(data\.imageUrl\)\.src\)/);
  });

  it('si la relectura no coincide o el preload falla, informa "todavía no puede visualizarse" en vez de exito', () => {
    expect(uploadBody).toMatch(/La imagen se guardó, pero todavía no puede visualizarse\./);
  });

  it("importa preloadImage, productHasExpectedImage/findProductById y getProductImageRenderConfig del mismo lugar que CatalogControlCenter", () => {
    expect(source).toMatch(/from "@\/lib\/preload-image"/);
    expect(source).toMatch(/from "@\/lib\/product-image-verify"/);
    expect(source).toMatch(/from "@\/lib\/product-image-render"/);
  });
});

describe("AddPerfumeModal: Badge retirado del formulario", () => {
  it("no muestra un campo Badge en la creación manual", () => {
    expect(source).not.toMatch(/Badge visible/);
    expect(source).not.toMatch(/badgeLabel/);
  });
});

describe("AddPerfumeModal: flujo crear -> obtener id -> subir imagen", () => {
  it("crea el producto ANTES de intentar subir la imagen (la imagen necesita un productId real)", () => {
    const createIndex = source.indexOf('const created = await fetchJson("/api/admin/products"');
    const uploadIndex = source.indexOf("uploadSelectedImage(productId)");
    expect(createIndex).toBeGreaterThan(-1);
    expect(uploadIndex).toBeGreaterThan(-1);
    expect(createIndex).toBeLessThan(uploadIndex);
  });

  it("si falla la imagen, NO se borra el producto creado (no hay llamada DELETE en esa rama)", () => {
    const catchBlockStart = source.indexOf("async function handleSubmit()");
    const catchBlockEnd = source.indexOf("async function retryImageOnly()");
    const handleSubmitBody = source.slice(catchBlockStart, catchBlockEnd);
    expect(handleSubmitBody).not.toMatch(/method:\s*"DELETE"/);
  });

  it('ofrece "Reintentar imagen" reutilizando el mismo productId (sin crear un producto duplicado)', () => {
    expect(source).toMatch(/function retryImageOnly/);
    expect(source).toMatch(/createdProductId/);
    const retryFn = source.slice(source.indexOf("async function retryImageOnly"), source.indexOf("function finishWithoutImage"));
    expect(retryFn).not.toMatch(/fetchJson\("\/api\/admin\/products",/); // no vuelve a crear el producto
  });

  it('informa "Producto creado sin imagen" en vez de afirmar éxito total cuando la imagen falla', () => {
    expect(source).toMatch(/Producto creado sin imagen/);
  });
});

describe("AddPerfumeModal: doble envío bloqueado", () => {
  it("handleSubmit sale de inmediato si ya hay un envio o una subida en curso", () => {
    const fnStart = source.indexOf("async function handleSubmit()");
    const fnBody = source.slice(fnStart, fnStart + 300);
    expect(fnBody).toMatch(/if \(submitting \|\| uploadingImage\) return;/);
  });

  it("el botón Guardar se deshabilita mientras se procesa (busy)", () => {
    expect(source).toMatch(/disabled=\{busy\}/);
  });
});

describe("AddPerfumeModal: campos obligatorios y validación por campo", () => {
  it("valida SKU, nombre, marca, contenido, costo, precio, stock y stock mínimo", () => {
    expect(source).toMatch(/El SKU es obligatorio/);
    expect(source).toMatch(/El nombre es obligatorio/);
    expect(source).toMatch(/La marca es obligatoria/);
    expect(source).toMatch(/El contenido es obligatorio/);
    expect(source).toMatch(/El costo debe ser 0 o mayor/);
    expect(source).toMatch(/El precio de venta debe ser mayor a 0/);
    expect(source).toMatch(/El stock debe ser un entero no negativo/);
    expect(source).toMatch(/El stock mínimo debe ser un entero no negativo/);
  });

  it("muestra los errores junto a cada campo (no un unico bloque generico)", () => {
    const errorRenders = source.match(/errors\.\w+ \? <p/g) ?? [];
    expect(errorRenders.length).toBeGreaterThanOrEqual(6);
  });
});

describe('AddPerfumeModal: "Recargo sobre costo" (no "Margen") y recargo predeterminado 35%', () => {
  it("usa DEFAULT_MARKUP_PERCENTAGE (35%) como recargo inicial", () => {
    expect(source).toMatch(/DEFAULT_MARKUP_PERCENTAGE/);
    expect(source).toMatch(/useState\(String\(DEFAULT_MARKUP_PERCENTAGE\)\)/);
  });

  it('la UI usa "Recargo sobre costo", nunca la palabra "Margen"', () => {
    expect(source).toMatch(/Recargo sobre costo/);
    expect(source).not.toMatch(/[Mm]argen/);
  });

  it("importa las funciones de lib/product-pricing (que envuelven calculateSalePrice del importador), no reimplementa la formula", () => {
    expect(source).toMatch(/from "@\/lib\/product-pricing"/);
    expect(source).toMatch(/calculateSuggestedPrice/);
    expect(source).toMatch(/calculateMarkupPercentageFromPrice/);
    expect(source).not.toMatch(/costo \* \(1 \+/); // la formula NO esta reescrita inline en el componente
  });
});

describe("AddPerfumeModal: marca existente o nueva", () => {
  it("ofrece seleccionar una marca existente y agregar una nueva", () => {
    expect(source).toMatch(/Selecciona una marca/);
    expect(source).toMatch(/\+ Agregar nueva marca/);
  });

  it("normaliza la marca nueva antes de guardar y avisa si ya existe una equivalente", () => {
    expect(source).toMatch(/normalizeBrandForSave/);
    expect(source).toMatch(/findEquivalentBrand/);
    expect(source).toMatch(/Ya existe la marca/);
  });
});
