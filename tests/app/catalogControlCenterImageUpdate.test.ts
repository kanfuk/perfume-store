import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Fase de correccion definitiva del fallback de imagenes en el Preview real:
 * el POST del backend puede confirmar persistencia en DB/Storage mientras el
 * navegador TODAVIA no puede cargar la URL (propagacion de CDN, cache del
 * optimizador de next/image). Por eso CatalogControlCenter ya no anuncia
 * exito solo porque el POST no lanzo una excepcion: hace una relectura GET
 * fresca + una precarga real con window.Image() (via lib/preload-image.ts)
 * y SOLO entonces reemplaza el producto local y cierra el editor. La logica
 * pura (reductor de reintentos, preloadImage, comparacion de campos) ya se
 * prueba con datos reales en tests/lib/*.test.ts; este archivo verifica que
 * el componente realmente use esas piezas en el orden correcto -- el
 * proyecto no tiene jsdom/RTL, asi que se verifica por inspeccion de
 * codigo fuente, el mismo patron ya usado para el resto de este componente.
 */
const source = readFileSync("components/admin/CatalogControlCenter.tsx", "utf8");

function bodyBetween(startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("CatalogControlCenter: verificacion real en el navegador antes de anunciar exito", () => {
  const verifyAndFinishBody = bodyBetween("async function verifyAndFinish(", "function retryVisualCheck()");

  it("hace una relectura GET fresca (cache: no-store) de /api/admin/products antes de decidir exito", () => {
    expect(verifyAndFinishBody).toMatch(/fetchJson\("\/api\/admin\/products",\s*\{\s*cache:\s*"no-store"\s*\}\)/);
  });

  it("compara la relectura contra lo subido con productHasExpectedImage antes de continuar", () => {
    expect(verifyAndFinishBody).toMatch(/productHasExpectedImage\(latest,/);
  });

  it("precarga imageUrl con preloadImage (window.Image real) antes de anunciar exito", () => {
    expect(verifyAndFinishBody).toMatch(/await preloadImage\(/);
  });

  it("preloadImage recibe el mismo src que renderizara ProductImage (getProductImageRenderConfig), nunca una URL distinta", () => {
    expect(verifyAndFinishBody).toMatch(/preloadImage\(getProductImageRenderConfig\(pending\.imageUrl\)\.src\)/);
  });

  it("onProductImageChanged (reemplazo del producto local) y el toast de exito ocurren DESPUES del preload, nunca antes", () => {
    const preloadIndex = verifyAndFinishBody.indexOf("await preloadImage(");
    const replaceIndex = verifyAndFinishBody.indexOf("onProductImageChanged(");
    const successIndex = verifyAndFinishBody.indexOf("feedback.success(");
    expect(preloadIndex).toBeGreaterThan(-1);
    expect(replaceIndex).toBeGreaterThan(preloadIndex);
    expect(successIndex).toBeGreaterThan(replaceIndex);
  });

  it("si la relectura no coincide o el preload falla, NO reemplaza localProducts ni cierra el editor (no llama cancelSelection)", () => {
    // Las dos ramas de fallo (mismatch de campos, preload false) terminan en
    // un `return` temprano ANTES de llegar a onProductImageChanged/cancelSelection.
    const failureBranches = verifyAndFinishBody.match(/return;/g) ?? [];
    expect(failureBranches.length).toBeGreaterThanOrEqual(2);
    expect(verifyAndFinishBody).not.toMatch(/if \(!loaded\)[\s\S]{0,80}cancelSelection/);
  });

  it('en fallo, guarda el intento en pendingVerificationRef y marca visualCheckFailed para ofrecer "Reintentar visualización"', () => {
    expect(verifyAndFinishBody).toMatch(/pendingVerificationRef\.current = pending;/);
    expect(verifyAndFinishBody).toMatch(/setVisualCheckFailed\(true\)/);
  });

  it('el mensaje de fallo es "La imagen se guardó, pero todavía no puede visualizarse."', () => {
    expect(verifyAndFinishBody).toMatch(/La imagen se guardó, pero todavía no puede visualizarse\./);
  });
});

describe('CatalogControlCenter: "Reintentar visualización" no vuelve a subir el archivo', () => {
  it("retryVisualCheck reutiliza pendingVerificationRef (no arma un nuevo FormData ni hace POST)", () => {
    const fnBody = bodyBetween("function retryVisualCheck()", "async function confirmUpload()");
    expect(fnBody).toMatch(/verifyAndFinish\(pendingVerificationRef\.current\)/);
    expect(fnBody).not.toMatch(/FormData|method:\s*"POST"/);
  });

  it('el boton "Reintentar visualización" solo aparece cuando visualCheckFailed es true', () => {
    expect(source).toMatch(/\{visualCheckFailed \? \(/);
    expect(source).toMatch(/Reintentar visualización/);
  });
});

describe("CatalogControlCenter: confirmUpload delega la decision de exito a verifyAndFinish", () => {
  const confirmUploadBody = bodyBetween("async function confirmUpload()", "async function confirmDelete()");

  it("no anuncia exito (feedback.success) ni reemplaza el producto directamente dentro de confirmUpload", () => {
    expect(confirmUploadBody).not.toMatch(/feedback\.success/);
    expect(confirmUploadBody).not.toMatch(/onProductImageChanged/);
  });

  it("solo llama a verifyAndFinish si el POST devolvio product, imageStoragePath e imageUrl", () => {
    expect(confirmUploadBody).toMatch(/if \(uploadResult\) \{/);
    expect(confirmUploadBody).toMatch(/await verifyAndFinish\(/);
  });
});

describe("CatalogControlCenter: eliminar imagen sigue usando el producto completo devuelto por el endpoint", () => {
  it("confirmDelete reemplaza el registro local con el producto devuelto por el endpoint", () => {
    const fnBody = bodyBetween("async function confirmDelete()", "const advancedPanel");
    expect(fnBody).toMatch(/onProductImageChanged\(product\.id,\s*data\.product/);
  });
});

describe("CatalogControlCenter: sin carreras de peticiones al recargar el catalogo", () => {
  it("refreshCatalog usa un identificador de solicitud e ignora respuestas que ya no son la mas reciente", () => {
    const fnBody = bodyBetween("async function refreshCatalog()", "const brands = useMemo");
    expect(fnBody).toMatch(/const requestId = \+\+refreshRequestIdRef\.current;/);
    expect(fnBody).toMatch(/refreshRequestIdRef\.current !== requestId/);
    expect(fnBody).toMatch(/cache:\s*"no-store"/);
  });

  it("no actualiza estado si el componente ya se desmonto (mountedRef)", () => {
    const fnBody = bodyBetween("async function refreshCatalog()", "const brands = useMemo");
    expect(fnBody).toMatch(/!mountedRef\.current/);
  });
});

describe("CatalogControlCenter: filas usan product.id como key, no la posicion", () => {
  it("las filas de tabla y las tarjetas mobile usan key={...id}, nunca key={index}", () => {
    expect(source).not.toMatch(/key=\{index\}/);
    expect(source).toMatch(/key=\{group\.items\[0\]\.id\}/);
    expect(source).toMatch(/key=\{product\.id\}/);
  });
});

describe('CatalogControlCenter: acceso "Agregar perfume" vive en Productos (Centro de productos)', () => {
  it('el encabezado embebido (Centro de productos) incluye un boton "Agregar perfume"', () => {
    const headerBody = bodyBetween("{embedded ? (\n        <section", "{error ? (");
    expect(headerBody).toMatch(/Centro de productos/);
    expect(headerBody).toMatch(/onClick=\{\(\) => setShowAddModal\(true\)\}/);
    expect(headerBody).toMatch(/Agregar perfume/);
  });

  it("reutiliza el AddPerfumeModal existente (no define un formulario/modal propio)", () => {
    expect(source).toMatch(/import \{ AddPerfumeModal \} from "@\/components\/admin\/dashboard\/AddPerfumeModal";/);
    expect(source).toMatch(/\{showAddModal \? \(\s*<AddPerfumeModal/);
    expect(source).not.toMatch(/function AddPerfumeModal/); // no hay una segunda definicion local
  });

  it("onSaved recarga el catalogo real (refreshCatalog), no un parche local inventado", () => {
    expect(source).toMatch(/onSaved=\{\(\) => void refreshCatalog\(\)\}/);
  });
});
