# Selección total y acciones globales en Stock rápido — Fase 2B.9

- Fecha: 2026-07-30
- Rama: `feature/perfume-store-foundation`
- Fase anterior: Fase 2B.8 (`docs/SMELLME_PRODUCT_FAMILIES_AND_VARIANTS.md`)
- Alcance: `/admin/stock` permite seleccionar productos rápidamente (visibles, resultados filtrados o todo el catálogo) y ejecutar acciones masivas (activar, pausar, dejar 1 disponible, sumar/restar/establecer, agotar) sin marcar tarjeta por tarjeta. Reutiliza y extiende el endpoint existente `POST /api/admin/products/bulk-stock` — no se creó ningún endpoint nuevo.
- Fuera de alcance (explícitamente): imágenes, nueva importación de CSV, despliegue a producción.

## 1. Familia vs. variante (recordatorio de la Fase 2B.8)

Las familias siguen siendo solo una agrupación visual. Esta fase trabaja exclusivamente sobre **productos/variantes reales** (`productId`) en `/admin/stock` — nunca se selecciona ni se actúa "por familia": si Lady Million 30ML/50ML/80ML son 3 productos, cada uno se selecciona de forma independiente (ver sección 4).

## 2. Selección: visible, filtrada, total

Nuevo módulo puro `lib/bulk-selection.ts` (sin React, 100% testeable): `selectIds` (unión), `clearSelection`, `toggleId`, `countVisibleSelected`, `isEntireCatalogSelected`.

`QuickStockPanel.tsx` ahora pagina la grilla (30 productos por página + "Cargar más", igual que el catálogo público) para que la distinción entre **visible** y **resultados filtrados** sea real:

| Botón | Alcance |
|---|---|
| Seleccionar visibles | Solo las tarjetas actualmente renderizadas (respeta la paginación/carga progresiva) |
| Seleccionar resultados | Todos los productos que coinciden con búsqueda + filtro rápido + marca, estén o no renderizados |
| Seleccionar todo | Todo el catálogo administrado, ignorando búsqueda y filtros |
| Limpiar selección | Vacía la selección por completo |

Los tres primeros **suman** (unión) a la selección existente — no la reemplazan — para poder combinar selecciones de distintos filtros sin perder lo ya elegido. Cambiar de búsqueda o filtro **nunca** vacía la selección automáticamente (solo "Limpiar selección" lo hace). Contador siempre visible: `"{n} producto(s) · {m} seleccionado(s)"`, y cuando hay seleccionados fuera del filtro actual se agrega `"· {k} visibles en este filtro"`.

## 3. Selección por `productId`, nunca por familia

Cada checkbox usa el `id` real del producto (`aria-label="Seleccionar {nombre} {contenido}"`, ej. `"Seleccionar Lady Million 80ML"`). Nada se selecciona por SKU, nombre o posición en la lista. Verificado con pruebas: seleccionar `lm-30ml` no afecta a `lm-50ml`/`lm-80ml` aunque compartan familia.

## 4. Acciones masivas (`services/productoService.ts`)

`BulkStockOperation` ahora tiene 7 tipos: `sumar`, `restar`, `establecer` (ya existían) + **nuevos** `activar`, `pausar` (ya existían como acciones pero con reglas distintas, ver abajo), `disponibleUno`, `agotar`.

Cada fila del preview/resultado ahora trae un `status` explícito — `CAMBIA` | `SIN_CAMBIOS` | `BLOQUEADO` — en vez de silenciarse dentro de un mensaje genérico:

- **ACTIVAR**: `activo = true`. **Cambio de comportamiento deliberado respecto a la Fase 2B.6/2B.7**: antes, activar en masa se bloqueaba si el producto no tenía stock (regla heredada del toggle individual). Ahora, como pide esta fase, activar masivo **nunca se bloquea por falta de stock** — un producto activo sin stock simplemente no aparece en el catálogo público (la familia solo se oculta si *ninguna* variante tiene stock, Fase 2B.8). El toggle **individual** de una sola tarjeta (`cambiarActivoStockRapido`) conserva su regla original sin cambios.
- **PAUSAR**: `activo = false`. Nunca borra stock, nunca toca reservas, nunca elimina el producto.
- **DEJAR STOCK DISPONIBLE EN 1** (`disponibleUno`): `stock_actual_final = stock_reservado + 1` (nunca `stock_actual_final = 1` a secas). Ejemplo: reserva 0 → total 1; reserva 2 → total 3.
- **AGOTAR DISPONIBILIDAD** (`agotar`, ahora también disponible como acción masiva, no solo por tarjeta): `stock_actual_final = stock_reservado`. Nunca queda por debajo del reservado, por construcción.
- **SUMAR/RESTAR/ESTABLECER**: sin cambios de reglas (restar/establecer se bloquean si el resultado quedaría por debajo del stock reservado).
- Todas las acciones tocan **únicamente** `stock_actual`/`stock_agenda` o `activo` — nunca costo, precio, `modo_precio`, imagen, Top 12 u ofertas (verificado con pruebas que inspeccionan las claves exactas del payload de `actualizarProducto`).
- Un producto que ya cumple el estado pedido (ej. activar uno que ya está activo) queda `SIN_CAMBIOS`, no se reescribe ni se cuenta como modificado.
- Un producto no encontrado (eliminado entre el preview y el confirm) queda `BLOQUEADO` con motivo explícito — nunca lanza una excepción no controlada.

## 5. Vista previa obligatoria

Ninguna acción masiva se ejecuta directamente. El flujo siempre es: elegir acción → **Vista previa** (obligatoria, `action: "preview"`, no escribe nada) → modal con el resumen → **Confirmar acción** (`action: "confirm"`). El modal muestra: título ("Pausar 101 productos"), consecuencia explicada en texto simple, y el desglose **cambiarán / ya cumplen / bloqueados** con el motivo de cada bloqueo listado.

### Confirmación especial al pausar todo el catálogo

Si la selección actual coincide exactamente con **todo** el catálogo (`isEntireCatalogSelected`, sin importar cómo se llegó a esa selección) y la acción es **Pausar**, el modal exige un checkbox adicional ("Entiendo que ningún perfume activo aparecerá públicamente.") antes de habilitar "Confirmar acción". No se pide escribir ninguna palabra ni código.

## 6. Seguridad del endpoint (`POST /api/admin/products/bulk-stock`)

Mismo endpoint de siempre, reutilizado y endurecido — no se creó un endpoint nuevo:

- Sesión admin, origen confiable y `Content-Type` se siguen validando igual que antes.
- **Nuevo**: lista blanca de tipos de operación (`BULK_STOCK_OPERATION_TYPES`, exportada desde `productoService.ts`) — una acción desconocida se rechaza con **400** antes de tocar el servicio (antes, un `type` desconocido caía silenciosamente en la rama de "pausar" por un `if/else` incompleto; ese bug quedó corregido).
- **Nuevo**: máximo **500** `productIds` por solicitud (rechaza con 400 si se excede).
- **Nuevo**: los `productIds` se **deduplican explícitamente** (no se rechazan) antes de procesar — una combinación de "seleccionar todo" + "seleccionar resultados" puede producir IDs repetidos de forma legítima, sin intención maliciosa.
- Arreglo vacío → 400 (ya existía). IDs no-string o vacíos se filtran.
- El servidor **recalcula todo** desde el estado real de cada producto: el navegador solo envía `productIds` + `operation` (+ el valor cuando corresponde, ej. `cantidad`/`valor`); el servidor calcula `stock_actual_final`, qué queda bloqueado, qué queda sin cambios y el resultado — nunca confía en un stock final calculado en el cliente.
- El hash de preview (`previewHash`, ya existente) ata la confirmación a la MISMA selección + operación exacta que generó el preview; cualquier cambio → 409.
- Si **todas** las filas del preview quedan `BLOQUEADO`, `confirm` se rechaza con 400 ("No hay productos válidos para actualizar") en vez de ejecutar una operación vacía.

## 7. Consistencia transaccional (limitación documentada)

`confirmarAjusteMasivoStock` procesa **producto por producto** (`for` + `await productRepository.actualizarProducto(...)`), igual que antes de esta fase. **No hay una transacción real de base de datos que envuelva todas las escrituras**: si el proceso se interrumpiera a mitad de camino (ej. caída de red), los productos ya procesados quedarían actualizados y el resto no. Esta fase no introduce una migración para envolver esto en una transacción SQL real (fuera de alcance: "no crear una migración salvo que sea imprescindible"); en su lugar, el resultado siempre reporta **exactamente** cuántos se modificaron, cuántos ya estaban en ese estado y cuántos quedaron bloqueados — nunca se afirma atomicidad, y no se oculta ningún resultado parcial.

## 8. Loading y resultado

- Durante el preview: botón "Vista previa" deshabilitado mientras calcula, sin barras de progreso falsas.
- Durante la confirmación: controles deshabilitados, `aria-live="polite"` con el texto `"Actualizando {n} productos…"`, sin recargar la página. El modal no se puede cerrar con Escape mientras la operación está en curso.
- En error: la selección **no se limpia**, el error se muestra sanitizado (mensaje del servidor, nunca detalles internos) y se puede reintentar sin repetir la elección.
- Al terminar con éxito: modal "Acción completada" con `{total} seleccionados / {actualizados} modificados / {sinCambios} ya estaban en ese estado / {bloqueados} bloqueados`, y botones **Mantener selección**, **Limpiar selección**, **Ver catálogo público**. El panel se recarga (`loadProducts()`) conservando los filtros y la búsqueda actuales.

## 9. Responsive y accesibilidad

- Botones táctiles ≥44px; en móvil, además de los 3 destacados (Activar/Pausar/Dejar 1 disponible) arriba de la grilla, aparece una barra inferior *sticky* con acceso rápido a Activar/Pausar/Limpiar mientras haya selección activa, con padding inferior reservado para no tapar la última tarjeta.
- El resto de acciones (sumar/restar/establecer/agotar) vive en un `<details>` "Más acciones" — visible, no oculto de forma agresiva.
- Checkbox con label accesible por producto (`"Seleccionar Lady Million 80ML"`).
- `aria-live="polite"` en: contador de seleccionados, progreso de la operación y resumen del resultado.
- El modal de preview recibe foco al abrirse (`tabIndex={-1}` + `.focus()`) y devuelve el foco al botón que lo abrió al cerrarse. Escape cierra el modal solo **antes** de iniciar la confirmación (deshabilitado mientras `bulkConfirming` es verdadero).

## 10. Limitaciones conocidas

- Sin entorno de pruebas de componentes React (`environment: "node"`, sin `jsdom`/`@testing-library`, igual que fases anteriores): toda la lógica de selección/estado se extrajo a `lib/bulk-selection.ts` (100% testeable); el comportamiento visual de `QuickStockPanel.tsx` se verificó por inspección de código, typecheck y build, no con un test de render.
- Sin transacción SQL real para el confirm masivo (sección 7) — riesgo de resultado parcial ante una interrupción a mitad de proceso, documentado y reportado explícitamente en el resultado.
- QA visual interactiva en navegador (390/768/1440) no se realizó: no hay herramienta de navegador disponible en este entorno y no se ejecutó ninguna acción masiva contra el catálogo remoto real durante la validación.

## 11. Ejemplos sanitizados

```
Selección: "Seleccionar resultados" con filtro "Solo sin stock" → 37 seleccionados, 12 visibles en este filtro.

Acción: Pausar · Alcance: Todo el catálogo (101/101)
→ Modal: "Pausar 101 productos" + checkbox de confirmación reforzada.
→ Resultado: 101 seleccionados · 96 modificados · 5 ya estaban pausados · 0 bloqueados.

Acción: Dejar stock disponible en 1
Producto A: reservado 0 → stock final 1.
Producto B: reservado 2 → stock final 3.
```
