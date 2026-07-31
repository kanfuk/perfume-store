# Centro administrativo unificado — Fase 3A

- Fecha: 2026-07-30
- Rama: `feature/admin-control-center-polish`
- Fase base: checkpoint de storefront 2B.11-2B.13 (`docs/SMELLME_STOREFRONT_CHECKPOINT_2B_11_TO_2B_13.md`)
- Alcance: unificar la **navegación, jerarquía visual, contexto, búsqueda, métricas y rutas** de Catálogo/Stock/Precios/Top 12 bajo "Gestión de catálogo" (`/admin/catalogo/*`), **sin fusionar la lógica** de cada módulo. Cada panel (`CatalogControlCenter`, `QuickStockPanel`, `QuickPriceEditPanel`, `Top12AdminPanel`) se reutiliza tal cual, con props opcionales pequeñas.
- Fuera de alcance (explícitamente): fotografías automáticas, cambios de Supabase, despliegue a producción, ficha rápida unificada (documentada como fase futura, sección 12).

## 1. Arquitectura

```
app/admin/catalogo/
  layout.tsx          -- auth (server, unica vez) + resumen (cacheado) + shell
  loading.tsx          -- skeleton automatico por segmento de ruta
  page.tsx              -- RESUMEN (metricas + acciones rapidas, no una lista)
  productos/page.tsx    -- CatalogControlCenter embedded
  stock/page.tsx        -- QuickStockPanel embedded
  precios/page.tsx      -- QuickPriceEditPanel embedded
  top12/page.tsx        -- Top12AdminPanel embedded

components/admin/catalog-center/
  AdminCatalogShell.tsx        -- unico punto que usa useSearchParams (aislado)
  AdminCatalogNavigation.tsx   -- usePathname, sin Suspense (no lee searchParams)
  AdminCatalogSearch.tsx       -- input controlado, sin logica de router propia
  AdminCatalogSummary.tsx      -- metricas (grid completo o tira compacta)
  AdminCatalogSkeleton.tsx     -- loading.tsx + reutilizable

lib/
  catalog-summary.ts        -- computeCatalogSummary (puro)
  admin-catalog-routes.ts   -- rutas/seccion activa/redirects (puro)
  admin-catalog-data.ts     -- React.cache() para no duplicar la consulta
```

**Nunca se monta más de un módulo a la vez**: cada ruta anidada renderiza exactamente un panel. No existe ningún `display:none` ni estado local que alterne entre los cuatro paneles — la navegación es siempre `<Link>` real (prefetch de Next.js incluido).

## 2. Rutas nuevas

| Sección | Ruta | Reutiliza |
|---|---|---|
| Resumen | `/admin/catalogo` | — (página nueva, solo métricas) |
| Productos | `/admin/catalogo/productos` | `CatalogControlCenter` |
| Stock | `/admin/catalogo/stock` | `QuickStockPanel` |
| Precios | `/admin/catalogo/precios` | `QuickPriceEditPanel` |
| Top 12 | `/admin/catalogo/top12` | `Top12AdminPanel` |

## 3. Rutas antiguas (compatibilidad)

`/admin/stock`, `/admin/precios`, `/admin/top12` ahora son **redirects puros** (`redirect()` de Next.js, 307), preservando el querystring original vía `resolveLegacyCatalogRedirect`/`buildQueryStringFromParams` (`lib/admin-catalog-routes.ts`, funciones puras con pruebas dedicadas). Ya no verifican sesión por sí mismas: el destino (`app/admin/catalogo/layout.tsx`) lo hace.

El menú principal del dashboard (`AdminDashboard.tsx`) ahora muestra **una sola entrada**: "Gestión de catálogo" → `/admin/catalogo` (antes había cuatro enlaces sueltos: Catálogo, Edición de precios, Top 12, además del propio Catálogo). "Importar catálogo" permanece como acceso directo aparte, ya que es una capacidad distinta (no una de las cuatro que se unifican). Los enlaces internos de `CatalogControlCenter` y del resumen final del importador (`CatalogImportPanel`) se actualizaron a las rutas nuevas.

## 4. Layout compartido

`app/admin/catalogo/layout.tsx` (Server Component): valida la sesión **una sola vez** con `isAdminAuthenticated()`; ninguna de las páginas anidadas la repite. Calcula el resumen (`getCachedCatalogSummary`, envuelto en `React.cache()` para que el layout y la página de resumen no consulten el repositorio dos veces dentro de la misma petición) y lo pasa como snapshot inicial a `AdminCatalogShell`.

`AdminCatalogShell.tsx` (Client Component) renderiza: título "Gestión de catálogo" + descripción, accesos a Inicio e Importar catálogo, la tira compacta de métricas, el buscador común y la navegación por secciones, y por último `{children}` (el contenido de la ruta activa).

## 5. Resumen y métricas

`/admin/catalogo` es un **resumen operativo**, no una segunda lista de productos: nunca renderiza fichas completas. Muestra 10 tarjetas accionables (`AdminCatalogSummary`, modo completo) — cada una es un `<Link>` a la sección+filtro correspondiente (nunca ejecuta una acción masiva desde aquí):

```
Ficha incompleta · 4  -> /admin/catalogo/productos?estado=incompleto
Sin stock · 7         -> /admin/catalogo/stock?stock=agotado
Precio manual · 12    -> /admin/catalogo/precios?modo=MANUAL
Top 12 pendientes · 3 -> /admin/catalogo/top12?estado=pendiente
```

Más una sección "Acciones rápidas" (Importar catálogo, Revisar fichas incompletas, Ajustar stock, Revisar precios manuales, Configurar Top 12) — enlaces, nunca botones que ejecuten algo directamente.

El shell (visible en **todas** las rutas anidadas) muestra una tira condensada con 4 números clave (total, incompletos, sin stock, Top 12 pendientes), también accionables.

## 6. API de resumen

`GET /api/admin/catalog-summary` (nuevo, liviano): retorna solo `{ total, activos, pausados, disponibles, sinStock, incompletos, preciosAuto, preciosManual, top12Asignados, top12Pendientes }` — nunca listas de productos, clientes, pedidos ni costos individuales. Reutiliza `ProductoService`/`ProductRepository` existentes (`obtenerResumenCatalogo()`, que llama al mismo `buscarTodosProductos()` que ya usaba `obtenerCatalogoAdmin` pero cuenta en vez de serializar cada producto). Requiere sesión admin (401 sin ella); sin migraciones ni tablas nuevas. Cálculo de conteos extraído a `computeCatalogSummary` (`lib/catalog-summary.ts`), función pura y testeada sin repositorio.

**Definiciones no obvias** (documentadas en el propio código): *disponibles* = activo Y con stock (no solo activo); *sinStock* = stock ≤ 0 sin importar si está pausado; *top12Pendientes* = `TOP_PRODUCTS_LIMIT - top12Asignados`, nunca negativo.

## 7. Búsqueda común

Un solo buscador (`AdminCatalogSearch`, dentro de `AdminCatalogShell`) sincronizado con `?q=`, con debounce de 350ms antes de actualizar la URL (`router.replace`, sin ensuciar el historial). Cada panel reutilizado recibe `initialSearch` y sincroniza su estado interno `query` vía un efecto explícitamente justificado (no es un simple "derivar de props": el usuario debe poder seguir escribiendo localmente si el panel se usa fuera del shell). **Cuando `embedded=true`, el input de búsqueda propio de cada panel se oculta** (nunca dos buscadores protagonistas en la misma pantalla); los demás filtros específicos de cada panel (marca, chips de estado, modo AUTO/MANUAL) se mantienen visibles y funcionales.

## 8. Filtros en la URL

`estado` (Productos/Top12), `stock` (Stock), `modo` (Precios) — cada panel traduce el valor "amigable" de la URL a su enum interno (`mapUrlEstadoToChipFilter`, `mapUrlStockToQuickFilter`, `mapUrlModoToModoFilter`, `mapUrlEstadoToTop12Filter`, cada uno colocado junto al componente dueño del enum). Nunca se guardan IDs de productos seleccionados en la URL.

**Top 12** ganó un filtro nuevo (Todas/Pendientes/Asignadas, chips simples) para que `?estado=pendiente` tenga un efecto real — antes no existía ningún filtro sobre las 12 posiciones.

## 9. Módulos reutilizados (sin duplicar lógica)

`CatalogControlCenter`, `QuickStockPanel`, `QuickPriceEditPanel`, `Top12AdminPanel` son exactamente los mismos componentes de fases anteriores — **ningún archivo `*V2`/`*New`/`*Copy`**. Se les agregaron props opcionales:

| Prop | Componentes | Efecto |
|---|---|---|
| `embedded?: boolean` (default `false`) | los 4 | Oculta el encabezado grande + accesos directos que ya da el shell; conserva toda la lógica operativa. Sigue funcionando standalone (`embedded=false`) para no romper ningún uso existente. |
| `initialSearch?: string` | Productos, Stock, Precios | Semilla de `query`; oculta el input propio cuando `embedded=true`. |
| `initialFilter?: string` | los 4 | Semilla del filtro interno correspondiente, mapeado desde el valor de URL. |

Ningún contrato de API cambió (`/api/admin/products`, `/api/admin/products/bulk-stock`, `/api/admin/products/bulk-price`, `/api/admin/top12` siguen exactamente igual).

## 10. Aislamiento de selecciones

La selección (`selectedIds`) sigue siendo estado **local de cada panel**, nunca compartida entre Stock/Precios/Productos/Top12 (Top12 no tiene selección múltiple). Cambiar de sección navega a una ruta distinta → el componente anterior se desmonta → su selección desaparece con él. No se agregó ningún mecanismo para "recordar" selecciones entre secciones (sección 11 del encargo lo prohíbe explícitamente: aplicar una acción en un módulo con productos seleccionados desde otro sería peligroso). El checkbox maestro, la vista previa obligatoria, el loading overlay, el resultado detallado y las reglas de reservas de Stock rápido **no se tocaron**.

**Ajuste puntual de la barra sticky del checkbox maestro**: cuando `embedded=true`, deja de ser `sticky` (antes competía por el mismo `top: 0` que la navegación del shell, que también es sticky en móvil, tapándose entre sí). El checkbox maestro sigue existiendo y siendo funcional, solo deja de "pegarse" al hacer scroll dentro del shell.

## 11. Rendimiento

- Una ruta = un módulo montado. Nunca los cuatro paneles simultáneos.
- El resumen se calcula **una vez por petición** vía `React.cache()` (layout + página de resumen comparten el resultado sin consultar dos veces).
- `app/admin/catalogo/loading.tsx` da un skeleton inmediato por segmento de ruta (convención nativa de Next.js, sin Suspense manual adicional para el contenido).
- `useSearchParams()` se usa en un único componente (`AdminCatalogShell`), envuelto en `<Suspense>` en el layout — el resto de la navegación (`usePathname()`) no lo necesita.
- Ninguna mutación (stock/precio/Top12/producto) hace un reload completo de página: cada panel sigue actualizando su propio estado local (`loadProducts()`/`await loadAll()`) exactamente como antes.
- No se instaló ninguna dependencia nueva (nada de React Query/Redux/Zustand): estado local + URL + los mismos `fetch` autenticados de siempre.

**Limitación documentada y deliberada**: el resumen (tira compacta del shell + página de resumen) es un snapshot server-side fresco en cada carga completa, pero **no se resincroniza en vivo** después de una mutación hecha dentro de un panel (ej. pausar 5 productos en Stock no actualiza al instante el número "Pausados" del shell sin navegar de nuevo o recargar). Sincronizarlo en vivo requeriría inyectar un callback de refresco dentro de la lógica interna de los 4 paneles — exactamente lo que el encargo pide evitar ("sin fusionar las lógicas", "props opcionales pequeñas"). Se documenta como decisión consciente, no como bug.

## 12. Responsive

- **Móvil**: navegación `sticky top-0` con scroll horizontal interno, sin overflow de página; título compacto; tira de métricas envuelve en varias líneas; buscador a ancho completo; botones ≥44px.
- **Escritorio**: navegación en una sola línea, métricas del resumen en grilla de hasta 5 columnas, ancho máximo coherente con el resto del panel admin (1400px, igual que los demás paneles).
- Las tablas/tarjetas internas de cada panel (ya convertidas en fases anteriores) no se tocaron.

## 13. Accesibilidad

- `aria-current="page"` en la sección activa de la navegación (nunca solo color).
- Anuncio discreto (`aria-live="polite"`, `sr-only`) del nombre de la sección activa al cambiar — deliberadamente **no** se envolvió todo el contenido en una región "live" (eso anunciaría cada tecla escrita dentro de un panel).
- Buscador con `aria-label` real ("Buscar perfume, marca o contenido").
- `AdminCatalogSkeleton` usa `aria-busy="true"`/`role="status"`.
- Navegación por teclado: `<Link>` nativos, sin trampas de foco nuevas.

## 14. Fase futura fuera de alcance: ficha rápida unificada

Esta fase **no** construye un editor unificado de "ficha completa de producto" (nombre+marca+contenido+precio+stock+imagen+Top12 en un solo formulario). Cada corrección puntual sigue haciéndose en su módulo especializado, o —para fichas incompletas— mediante el asistente de importación (Fase 2B.13). Una ficha rápida unificada es un candidato natural para una fase posterior sobre `feature/admin-control-center-polish`, pero se deja fuera intencionalmente de esta base.

## 15. Fotografías: fuera de alcance

No se buscó, generó, subió ni asignó ninguna imagen en esta fase. El flujo de fotografías (mencionado en el encargo como explícitamente pendiente) no se inició.

## 16. Pruebas

- `tests/lib/catalog-summary.test.ts` — `computeCatalogSummary`: catálogo vacío, activos/pausados, disponibles vs. activos, sin stock, incompletos, AUTO/MANUAL, Top12 asignados/pendientes (nunca negativo), límite por defecto.
- `tests/lib/admin-catalog-routes.test.ts` — construcción de rutas con/sin parámetros, preservación de `q`, sección activa por pathname, redirects de rutas antiguas con querystring preservado, reconstrucción de querystring desde `searchParams`.
- `tests/app/adminCatalogSummaryRoute.test.ts` — 401 sin sesión (sin llamar al servicio), 200 con el resumen exacto, nunca retorna listas, error controlado como 500.
- `tests/services/productoService.stockAndTop12.test.ts` (ampliado) — `obtenerResumenCatalogo` sobre un catálogo mixto real (vía `FullProductRepositoryStub`), nunca retorna una lista.

Se extrajo toda la lógica de rutas/métricas a funciones puras precisamente para poder probarlas sin `jsdom`/Testing Library (el proyecto sigue en `environment: "node"`); el comportamiento visual del shell (navegación sticky, layout responsive, Suspense) se verificó por inspección de código, build y Preview real — no con un test de render.

## 17. Fase 3A.1 — Pulido de filtros de Productos

Pasada de pulido puramente visual sobre `/admin/catalogo/productos` (`components/admin/CatalogControlCenter.tsx`). **Sin cambios de arquitectura, rutas, lógica de filtrado ni backend** — único archivo tocado en esta fase.

**Causa del desorden original**: los chips de filtro (`Todos`, `Activos`, `Pausados`, `Sin stock`, `Stock bajo`, `Top 12`, `Sin imagen`, `Ficha incompleta`) usaban `flex flex-wrap` con ancho determinado únicamente por su propio texto — "Ficha incompleta" y "Sin stock" miden muy distinto, así que el wrap producía filas irregulares con huecos sobrantes. El selector de marca vivía en un `grid` separado, sin relación visual con los chips, y no había ninguna pista de que "chip + marca" se combinan con AND (por eso 0 resultados combinando dos filtros se sentía como un error, no como una consecuencia esperada).

**Grilla responsive**: se reemplazó el wrap libre por `grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4` — 2 columnas en móvil, 3 en tablet, 4 en escritorio (los 8 chips completan exactamente 2 filas en escritorio, sin fila colgante). Cada botón mide `h-11` (44px, mínimo táctil), ocupa el 100% de su celda, texto centrado con truncado solo si hace falta.

**Estilos activo/inactivo**: un único sistema sobrio para los 8 chips y el selector de marca — inactivo: borde `#e4e7ec`, fondo blanco, texto gris `#667085`; activo: borde y texto violeta (`#5434e6`) sobre fondo violeta muy suave (`#eeebff`), con `aria-pressed` real (nunca solo color). Los chips de advertencia (`Sin stock`, `Stock bajo`, `Ficha incompleta`) suman únicamente un punto ámbar de 6px **cuando están activos** — nunca cambian de paleta ni se vuelven chips ámbar aparte; siguen perteneciendo al mismo sistema violeta.

**Selector de marca integrado**: se mantuvo debajo de la grilla, dentro de la misma tarjeta blanca (nunca un contenedor aparte), con una etiqueta discreta "Marca" (`<label>` real, uppercase, `text-[#98a2b3]`) y la misma altura (`h-11`), borde, radio y tipografía que los chips. Value/onChange/lógica sin cambios — sigue siendo el mismo `brandFilter` local de siempre.

**Combinación de filtros**: nueva línea de contexto "Filtros activos: Ficha incompleta · Burberry" que aparece **solo cuando hay 2+ filtros combinados** (un chip distinto de "Todos" *y* una marca elegida) — con un único filtro activo no se repite la obviedad de su propio estado visual.

**Limpiar filtros**: acción secundaria discreta (texto violeta, no un botón protagonista) que aparece con **cualquier** filtro activo (chip o marca, no hace falta que sean 2). Resetea únicamente `chip` y `brandFilter` a sus valores por defecto.

**Preservación de `q`**: se auditó explícitamente antes de tocar nada — la implementación actual ya distinguía la búsqueda común del shell (`query`, sincronizada con `?q=`) de los filtros propios de este panel (`chip`/`brandFilter`, estado local, nunca escrito en la URL). "Limpiar filtros" respeta esa separación existente y **nunca toca `query`/`q`**; no se cambió ese comportamiento.

**Empty state**: cuando `filtered.length === 0`, además del mensaje "Sin productos que coincidan con la búsqueda." ya existente, se agrega la acción "Limpiar filtros" —solo si hay algún chip/marca activo— tanto en la fila vacía de la tabla de escritorio como en la tarjeta vacía de móvil. La lógica de búsqueda/filtrado no se tocó, solo se ofrece una salida visible cuando la combinación no devuelve resultados.

**Sin cambios de lógica ni backend**: `chipFiltered`, `filtered`, `filterAndSortProducts`, `mapUrlEstadoToChipFilter`, `getAvailableBrands` y toda la obtención de datos (`/api/admin/products`) quedaron exactamente igual. No se tocó ningún helper puro de `lib/admin-catalog-routes.ts` ni `lib/catalog-summary.ts`, por lo que no se agregaron pruebas nuevas — el encargo de esta fase permite omitirlas cuando no se modifica lógica de construcción de rutas/filtros/etiquetas en un módulo puro, y aquí toda la lógica nueva (etiquetas de filtros activos, limpieza) es estado local trivial dentro del propio componente.
