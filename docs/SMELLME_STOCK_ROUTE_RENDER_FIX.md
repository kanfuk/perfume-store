# Fix: doble pantalla al abrir Stock

## Síntoma

Al abrir `/admin/catalogo/stock` (desde el dashboard, desde "Gestión de
catálogo", por URL directa o al recargar), el usuario veía brevemente una
pantalla casi vacía —cabecera "Gestión de catálogo" + navegación + el texto
"Cargando catálogo..."— que ~1s después era reemplazada por la grilla
completa de productos. Se percibía como dos diseños distintos.

## Causa raíz (demostrada por código, sin suponer)

La cabecera y la navegación de "Gestión de catálogo" ya se calculan en el
servidor y no cambian entre secciones (`AdminCatalogShell`,
`AdminCatalogNavigation`): no había doble shell, doble ruta, `useEffect` de
selección tardía, `localStorage`/`sessionStorage`, ni `router.replace` tras
el montaje. Se verificó explícitamente la ausencia de todos estos patrones.

El salto real estaba dentro de `components/admin/QuickStockPanel.tsx`: el
componente monta con `loading = true` y hace `fetch("/api/admin/products")`
en el cliente. Mientras esa llamada estaba pendiente, la sección de
resultados renderizaba una sola línea de texto:

```tsx
{loading ? (
  <p className="text-sm text-[#667085]">Cargando catálogo...</p>
) : (
  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{/* tarjetas */}</div>
)}
```

Ese salto de una línea de texto a una grilla completa de tarjetas (varias
filas, con controles de stock) es el "cambio de diseño" reportado. Ocurre en
**todo** acceso a Stock (primera carga, cambio de pestaña, recarga, volver),
porque `QuickStockPanel` se monta de cero cada vez y siempre parte de
`loading = true`.

Se descartaron explícitamente (verificado leyendo el código, no supuesto):

- Doble implementación de Stock: no existe. `/admin/stock` es un redirect de
  servidor (`redirect()`, sin `"use client"`) hacia `/admin/catalogo/stock`.
- Selección tardía de pestaña: `AdminCatalogNavigation` resuelve la sección
  activa con `usePathname()` (síncrono, disponible desde el primer render).
- `localStorage`/`sessionStorage`: ausentes en todo el shell de catálogo y
  en `QuickStockPanel`.
- Redirects cliente tras montaje: no hay `router.push`/`router.replace` en
  la navegación por pestañas (usa `<Link>` real) ni en el layout.
- Hidratación inconsistente: `QuickStockPanel` es un componente cliente sin
  datos de servidor; su estado inicial (`loading = true`, `products = []`)
  es idéntico en servidor y cliente, sin acceso a `window`/`localStorage`
  durante el render inicial.

## Ruta canónica

`/admin/catalogo/stock` (ya era la única ruta real; no cambió). La antigua
`/admin/stock` sigue redirigiendo en servidor, preservando query string.

## Corrección aplicada

Se reemplazó el placeholder de una línea por un skeleton con la misma
grilla y alturas aproximadas que las tarjetas finales (`components/admin/QuickStockPanel.tsx`),
de forma que la cabecera, la navegación y la estructura de la sección no
cambian entre el estado de carga y el estado final — solo el contenido de
cada tarjeta pasa de skeleton a datos reales. También se ajustó el contador
("Cargando catálogo..." en vez de "0 producto(s) encontrado(s)") para no
mostrar un conteo momentáneamente incorrecto.

No se tocó: fetching de datos, cálculos de stock, rutas, autenticación,
Supabase, ni la lógica comercial de `QuickStockPanel`.

## Pruebas

Se agregó `tests/app/adminCatalogStockRouteRenderStability.test.ts` (12
casos) verificando estáticamente los invariantes de arquitectura:

- La página de Stock monta únicamente `QuickStockPanel` (nunca Resumen ni
  Productos).
- No hay selección tardía (`useEffect`/`useState` en la página, ni
  `activeSection` inicial en "resumen").
- El redirect legacy es de servidor, sin `useEffect` ni `router.*`.
- La navegación por pestañas usa `<Link>`, no `setState + router.push`.
- Ausencia de `localStorage`/`sessionStorage` en el shell y en Stock.
- El estado de carga usa el skeleton en grilla, no una sola línea de texto.
- El título "Gestión de catálogo" aparece una única vez (en el shell
  compartido), nunca duplicado dentro de Stock.
- La sesión se valida una sola vez, en el layout compartido.

Suite completa: 824 pruebas (812 previas + 12 nuevas), todas en verde.

El entorno de pruebas del proyecto (`vitest`, `environment: "node"`, sin
`jsdom`/React Testing Library) no permite renderizar componentes; por eso
las pruebas son de inspección estática de código fuente en vez de render
de DOM. No se agregaron dependencias nuevas.

## Viewports / responsive

El cambio es puramente de contenido dentro de una grilla ya responsive
(`grid gap-3 sm:grid-cols-2 xl:grid-cols-3`, ya usada por las tarjetas
reales); no se modificaron breakpoints, anchos ni el layout del shell.

## Resultado

- Una sola cabecera, una sola navegación, un solo layout durante toda la
  carga de Stock.
- El skeleton reserva altura similar a las tarjetas reales: sin salto de
  diseño perceptible al llegar los datos.
- Cero cambios en rutas, autenticación, Supabase o lógica de stock.

## Limitaciones

No se hizo una reproducción visual en navegador con sesión real de admin:
requeriría autenticarse contra el Supabase configurado en `.env.local`
(que no es una instancia local aislada), fuera del alcance autorizado para
esta tarea (no tocar Auth/Supabase, no crear datos reales). La causa se
demostró por lectura de código y por las reglas documentadas de streaming/
Suspense de Next.js App Router, confirmando que la cabecera y navegación ya
eran estables y que el único placeholder de una sola línea vivía en
`QuickStockPanel`. Se validó en cambio, sin sesión, que las rutas
redirigen correctamente en servidor (307 a `/admin/login`, sin fuga de
contenido protegido) y que las APIs responden 401 sin sesión.

Se detectó además un `<Suspense fallback={<AdminCatalogSkeleton />}>` en
`app/admin/catalogo/layout.tsx` colocado *después* de los `await` de
autenticación y resumen, por lo que nunca llega a mostrarse en la práctica
(el layout ya resolvió esos datos antes de construir ese árbol). No se
modificó por no contribuir al salto de diseño reportado y para mantener el
alcance de este fix acotado a Stock; queda documentado para una futura
limpieza si se decide abordarlo.
