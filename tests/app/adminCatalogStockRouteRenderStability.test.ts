import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Regresion para el "flash" reportado al abrir /admin/catalogo/stock: una
 * pantalla casi vacia (header + "Cargando catalogo...") se mostraba durante
 * ~1s antes de ser reemplazada por la grilla completa de productos, lo que
 * se percibia como dos disenos distintos. Ver docs/SMELLME_STOCK_ROUTE_RENDER_FIX.md.
 */

const stockPageSource = readFileSync("app/admin/catalogo/stock/page.tsx", "utf8");
const legacyStockRedirectSource = readFileSync("app/admin/stock/page.tsx", "utf8");
const quickStockPanelSource = readFileSync("components/admin/QuickStockPanel.tsx", "utf8");
const catalogShellSource = readFileSync("components/admin/catalog-center/AdminCatalogShell.tsx", "utf8");
const catalogNavigationSource = readFileSync("components/admin/catalog-center/AdminCatalogNavigation.tsx", "utf8");
const catalogLayoutSource = readFileSync("app/admin/catalogo/layout.tsx", "utf8");
const catalogSkeletonSource = readFileSync(
  "components/admin/catalog-center/AdminCatalogSkeleton.tsx",
  "utf8"
);

describe("Ruta canonica /admin/catalogo/stock renderiza Stock directamente", () => {
  it("la pagina de Stock solo monta QuickStockPanel (nunca el Resumen ni Productos)", () => {
    expect(stockPageSource).toMatch(/<QuickStockPanel\b/);
    expect(stockPageSource).not.toMatch(/AdminCatalogSummary|CatalogControlCenter|Acciones rápidas/);
  });

  it("no existe seleccion tardia de seccion: la pagina no depende de useEffect ni de estado inicial generico", () => {
    expect(stockPageSource).not.toMatch(/useEffect|useState/);
    expect(stockPageSource).not.toMatch(/activeSection\s*=\s*["']resumen["']/);
  });

  it("la ruta legacy /admin/stock redirige en el servidor, no en el cliente", () => {
    expect(legacyStockRedirectSource).not.toMatch(/use client/);
    expect(legacyStockRedirectSource).toMatch(/redirect\(/);
    expect(legacyStockRedirectSource).not.toMatch(/useEffect|router\.push|router\.replace/);
  });
});

describe("Navegacion del shell de catalogo: sin localStorage ni redirects tardios", () => {
  it("la navegacion por pestañas usa <Link> real, no setState + router.push", () => {
    expect(catalogNavigationSource).toMatch(/<Link\b/);
    expect(catalogNavigationSource).not.toMatch(/router\.push|router\.replace/);
  });

  it("la seccion activa se deriva de usePathname (URL), nunca de localStorage/sessionStorage", () => {
    expect(catalogNavigationSource).toMatch(/usePathname/);
    expect(catalogNavigationSource).not.toMatch(/localStorage|sessionStorage/);
  });

  it("el shell compartido no lee almacenamiento local para decidir que mostrar", () => {
    expect(catalogShellSource).not.toMatch(/localStorage|sessionStorage/);
  });

  it("QuickStockPanel no depende de almacenamiento local para su estado inicial", () => {
    expect(quickStockPanelSource).not.toMatch(/localStorage|sessionStorage/);
  });
});

describe("Estado de carga de Stock no produce salto de diseño", () => {
  it("el estado de carga usa un skeleton con la misma grilla que las tarjetas finales, no una sola linea de texto", () => {
    const loadingBranch = quickStockPanelSource.slice(
      quickStockPanelSource.indexOf("{loading ? ("),
      quickStockPanelSource.indexOf("{loading ? (") + 1500
    );
    expect(loadingBranch).toMatch(/grid gap-3 sm:grid-cols-2 xl:grid-cols-3/);
    expect(loadingBranch).toMatch(/Array\.from\(\{ length: \d+ \}\)/);
    expect(loadingBranch).not.toMatch(/^\s*<p className="text-sm text-\[#667085\]">Cargando catálogo\.\.\.<\/p>\s*$/m);
  });

  it("el skeleton de carga nunca reproduce el titulo ni las acciones del Resumen", () => {
    expect(quickStockPanelSource).not.toMatch(/Gestión de catálogo|Acciones rápidas/);
  });

  it("AdminCatalogSkeleton (loading.tsx) es generico y no incluye el titulo de otra seccion", () => {
    expect(catalogSkeletonSource).not.toMatch(/Gestión de catálogo|Resumen|Acciones rápidas/);
  });
});

describe("AdminDashboard ya no monta un panel de Stock legado (causa raiz real del flash)", () => {
  const adminDashboardSource = readFileSync("components/admin/AdminDashboard.tsx", "utf8");
  const adminDashboardTypesSource = readFileSync(
    "components/admin/dashboard/admin-dashboard.types.ts",
    "utf8"
  );
  const adminNavSource = readFileSync("components/admin/dashboard/AdminNav.tsx", "utf8");
  const adminDashboardConstantsSource = readFileSync(
    "components/admin/dashboard/admin-dashboard.constants.ts",
    "utf8"
  );

  it(
    "QA manual demostro que el flash real no era de /admin/catalogo/stock: " +
      "AdminDashboard.tsx (montado en /admin, /admin/pedidos, etc.) tenia un panel " +
      "completo '{view === \"stock\"}' (cabecera, buscador, tarjetas) que se " +
      "renderizaba de inmediato al hacer click en 'Stock' (navigateToView hace " +
      "setView(\"stock\") de forma sincronica ANTES de que router.push complete " +
      "la navegacion a /admin/catalogo/stock), y esa pantalla vieja SI se veia " +
      "durante la transicion. El fix de skeleton anterior no podia arreglar esto " +
      "porque el problema ocurria en OTRA pagina, antes de llegar a la ruta corregida.",
    () => {
      expect(adminDashboardSource).not.toMatch(/\{view === ["']stock["']/);
    }
  );

  it("'stock' ya no es un AdminView valido: no hay panel legado que un futuro cambio pueda volver a montar", () => {
    expect(adminDashboardTypesSource).not.toMatch(/"stock"/);
  });

  it("ningun trigger llama navigateToView(\"stock\"): Stock navega siempre por <Link> real", () => {
    expect(adminDashboardSource).not.toMatch(/navigateToView\(\s*["']stock["']\s*\)/);
  });

  it("la navegacion principal apunta a la ruta canonica /admin/catalogo/stock directamente (no a /admin/stock)", () => {
    expect(adminDashboardConstantsSource).toMatch(
      /id:\s*["']stock["'][^}]*href:\s*["']\/admin\/catalogo\/stock["']/s
    );
  });

  it("AdminNav usa <Link> real para los destinos principales, nunca onClick + setState para decidir la vista", () => {
    const primaryNavBlock = adminNavSource.slice(
      adminNavSource.indexOf("ADMIN_PRIMARY_NAV.map"),
      adminNavSource.indexOf("ADMIN_PRIMARY_NAV.map") + 600
    );
    expect(primaryNavBlock).toMatch(/<Link/);
    expect(primaryNavBlock).not.toMatch(/onClick/);
  });

  it("acceso directo y navegacion desde el menu producen el mismo resultado: ambos son la misma <Link href> a la ruta canonica", () => {
    // AdminNav (menu) y un acceso directo (escribir la URL) llegan al mismo
    // sitio porque ambos son, literalmente, la misma URL -- no hay un estado
    // de cliente intermedio que puede divergir entre ambos caminos.
    expect(adminDashboardConstantsSource).toMatch(/href:\s*["']\/admin\/catalogo\/stock["']/);
  });
});

describe("Una sola cabecera para toda la seccion de catalogo", () => {
  it("el titulo 'Gestión de catálogo' aparece una unica vez, en el shell compartido", () => {
    const occurrencesInShell = (catalogShellSource.match(/>Gestión de catálogo</g) ?? []).length;
    expect(occurrencesInShell).toBe(1);
    expect(stockPageSource).not.toMatch(/Gestión de catálogo/);
  });

  it("la sesion se valida una sola vez en el layout compartido, no en cada pagina anidada", () => {
    expect(catalogLayoutSource).toMatch(/isAdminAuthenticated/);
    expect(stockPageSource).not.toMatch(/isAdminAuthenticated/);
  });
});
