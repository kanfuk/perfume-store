# Cierres semanales administrativos — diseño (Fase 7.6A)

Implementación recuperada desde `feature/weekly-admin-closures` e integrada
en V2.2. La migración y sus funciones están aplicadas en el proyecto remoto
`nxgkudvrotlaqvvhygem`.

## Alcance

Cerrar un período semanal (lunes a domingo, hora de Chile) guardando una
fotografía inmutable de sus métricas, con historial completo, prevención
atómica de duplicados, reapertura auditada con motivo obligatorio, re-cierre
posterior (nueva versión) y exportación CSV. Sin tocar Top 15, Ofertas,
banlist, pedidos, stock, costos ni precios existentes — este módulo **lee**
esos datos, nunca los modifica.

## Auditoría del modelo real (evidencia, no suposiciones)

| Métrica | Fuente de verdad | Definición usada aquí |
|---|---|---|
| Ventas | `pedido_items.subtotal`, agregado igual que la pestaña "Rentabilidad" existente | Suma de `item.subtotal` de todos los items de pedidos en `finalizados` (PAGADO+PREPARANDO+DESPACHADO+ENTREGADO) cuya fecha canónica cae en el período |
| Ingresos (caja) | `pagos.monto` | Suma de `pagos.monto` cuyo `fecha_pago` cae en el período. **Distinto de "ventas"**: una venta a fiado cuenta como venta pero no como ingreso hasta que se registre el pago |
| Costos | `pedido_items.costo_total` (congelado) con la misma jerarquía de fallback que `resolveOrderItemProfitabilityCost` (`components/admin/dashboard/admin-dashboard.utils.ts:372-436`) | Igual que la pestaña "Rentabilidad": costo guardado → `costo_unitario*cantidad` guardado → costo **actual** del producto → estimación del 50% del precio de venta. Items sin ningún dato (`status: "missing"`) se excluyen de costos/utilidad, igual que hoy |
| Utilidad | `ventas reconocidas - costos reconocidos` (excluyendo items `missing`) | Misma fórmula y mismo criterio de exclusión que la pestaña "Rentabilidad" (`totalCostos`/`totalUtilidad` solo suman si `status !== "missing"`, `components/admin/AdminDashboard.tsx:986-1026`) |
| Pedidos | `pedidos.fecha_pedido` | Conteo de pedidos (cualquier estado) cuya `fecha_pedido` cae en el período |
| Cancelados | `pedidos.estado_pedido = 'CANCELADO'` | Igual regla de fecha que "Pedidos" (`fecha_pedido` en el período) |
| Pendientes | `pedidos.estado_pedido in ('NUEVO','AGENDADO','PAGADO','PREPARANDO','DESPACHADO')` | Agrupación **nueva, documentada aquí**: "aún no resuelto" (ni entregado ni cancelado). Distinta de los buckets separados `pendientes`(NUEVO)/`agendados`(AGENDADO) que ya expone el dashboard, unificados aquí para dar exactamente la métrica "pendientes" pedida |
| Entregados | `pedidos.estado_pedido = 'ENTREGADO'` | Igual regla de fecha |
| Ventas directas | `pedidos.origen_pedido = 'ADMIN_DIRECTO'` | Confirmado como parte del negocio canónico (`lib/admin-sales-summary.ts:17`, `CONFIRMED_SALE_ORIGINS`); conteo dentro de `finalizados` en el período |
| Fiado / saldo pendiente | `fiados.monto_pendiente` | Suma de `monto_pendiente` de fiados cuyo `fecha_fiado` cae en el período (medido al momento del cierre, no recalculado después) |

**Por qué "ventas" e "ingresos" NO son la misma métrica aquí**: la pestaña
"Rentabilidad" existente calcula "ventas" como todo lo facturado en pedidos
`finalizados`, **incluyendo ventas a fiado sin pagar** (`ADMIN_DIRECTO` con
`estadoPago: SIN_PAGO` se crea directamente en `ENTREGADO`,
`repositories/pedidoRepository.ts:833,839-840`). Un cierre semanal que
reporte solo "ventas" ocultaría cuánto dinero realmente entró a caja esa
semana. Por eso se agrega "ingresos" como métrica nueva y explícitamente
distinta, calculada desde `pagos` (dinero efectivamente recibido), sin
inventar una fórmula: es una suma directa sobre una tabla real ya existente.

**Dos fórmulas de costo/utilidad coexistían en el código** (`pedidoService.
enriquecerPedidosAdmin`, estricta, usada en casi todo el dashboard, vs.
`resolveOrderItemProfitabilityCost`, con fallback a costo actual del
producto y estimación del 50%, usada solo en la pestaña "Rentabilidad").
Se eligió **`resolveOrderItemProfitabilityCost`** porque es la que el admin
ve como "el" reporte de rentabilidad hoy, y porque ya tiene cobertura de
tests (`tests/components/admin-dashboard.utils.test.ts:47-80`). El cierre
reutiliza esa función tal cual (import directo, sin reimplementarla).

## Período: semana calendario lunes–domingo, hora de Chile

Se reutiliza `getChileCurrentWeekRange` (`lib/date.ts:93-106`), ya en
producción para la tarjeta "esta semana" del home admin. Se añade una nueva
función pura `getWeekPeriodBoundaries` (en un nuevo módulo, ver
`lib/weekly-closures/period.ts`) que, a partir de una fecha de referencia,
calcula:

- `periodStart`: lunes 00:00:00 America/Santiago;
- `periodEndExclusive`: **el lunes siguiente** 00:00:00 America/Santiago
  (intervalo semiabierto `[periodStart, periodEndExclusive)`).

Se evita deliberadamente `23:59:59.999` (impreciso, se puede perder el
último milisegundo o solaparse con el instante exacto de medianoche) a
favor de un límite superior exclusivo, calculado como el instante exacto de
inicio de la semana siguiente. La conversión de "fecha calendario en Chile"
a instante UTC exacto usa el mismo patrón ya validado por `lib/date.ts`
(formatear en `America/Santiago` vía `Intl.DateTimeFormat`, luego construir
el instante con el offset correcto) para no reintroducir bugs de
DST/UTC ya resueltos en ese archivo.

No se ofrece selección de rango arbitrario en el MVP: solo semanas
calendario completas (lunes a domingo), consistente con "preferir semanas
calendario normalizadas" del encargo.

## Modelo histórico: snapshot inmutable con versionado

Tabla `cierres_semanales` (nombre en español, consistente con `pedidos`,
`clientes`, `productos`, `pagos`, `fiados`).

```
id                     uuid primary key
period_start           timestamptz not null
period_end_exclusive   timestamptz not null
version                integer not null
status                 text not null check (status in ('CLOSED','REOPENED'))
orders_count           integer not null default 0
cancelled_orders_count integer not null default 0
pending_orders_count   integer not null default 0
delivered_orders_count integer not null default 0
direct_sales_count     integer not null default 0
gross_sales            numeric not null default 0
income_amount          numeric not null default 0
cost_amount            numeric not null default 0
profit_amount          numeric not null default 0
outstanding_amount     numeric not null default 0
snapshot_json          jsonb not null default '{}'::jsonb
closed_at              timestamptz not null default now()
closed_by_email        text
closed_by_nombre       text
reopened_at            timestamptz
reopened_by_email      text
reopened_by_nombre     text
reopen_reason          text
created_at             timestamptz not null default now()
updated_at             timestamptz not null default now()
```

`status` usa un conjunto controlado (`CHECK ... in ('CLOSED','REOPENED')`),
nunca texto libre. `version` empieza en 1 y nunca se reutiliza dentro del
mismo `(period_start, period_end_exclusive)`. Cerrar → reabrir → volver a
cerrar crea una **fila nueva** (versión 2); la versión 1 permanece intacta,
con su propio `snapshot_json` y sus propias fechas — nunca se actualiza ni
se borra una revisión anterior.

`snapshot_json` guarda el detalle completo (desglose por origen, cantidad de
items con costo estimado/faltante, etc.) para auditoría futura sin tener que
agregar columnas nuevas cada vez que se necesite un detalle adicional.

## Prevención atómica de duplicados

Índice único parcial:

```sql
create unique index cierres_semanales_periodo_activo_idx
  on public.cierres_semanales (period_start, period_end_exclusive)
  where status = 'CLOSED';
```

Esto permite múltiples filas `REOPENED` para el mismo período (el historial
completo de versiones), pero **como máximo una fila `CLOSED`** a la vez.
Un segundo intento concurrente de cerrar el mismo período falla con
`unique_violation` (SQLSTATE 23505), que la función envuelve en un código de
error propio (`WC001`).

## RPC de cierre: `create_weekly_closure_v1`

Firma: `(p_period_start timestamptz, p_period_end_exclusive timestamptz,
p_metrics jsonb, p_admin_email text, p_admin_nombre text) returns
cierres_semanales`.

**Las métricas se calculan en TypeScript (servicio), no en SQL.** Razón
documentada explícitamente (sección 6 del encargo: "si el cálculo completo
en SQL duplicaría demasiada lógica canónica, calcular en servicio
server-side"): `resolveOrderItemProfitabilityCost` tiene una jerarquía de
fallback de 4 niveles (costo guardado → costo unitario guardado → costo
actual del producto → estimación del 50%) que ya existe, probada, en
TypeScript. Reimplementarla en PL/pgSQL duplicaría esa lógica de negocio en
un segundo lugar, con riesgo real de que diverjan silenciosamente. El
servicio calcula el snapshot completo reutilizando `PedidoService` +
`resolveOrderItemProfitabilityCost`, y se lo pasa a la función como
`jsonb`; la función solo:

1. valida `p_period_start < p_period_end_exclusive`;
2. calcula la siguiente versión: `coalesce(max(version) where period
   matches, 0) + 1`;
3. inserta **una sola fila** `CLOSED` con esos valores;
4. si ya existe una fila `CLOSED` activa para ese período, el índice único
   parcial rechaza el `INSERT` atómicamente (nunca dos filas `CLOSED` para
   el mismo período, sin importar cuántas solicitudes concurrentes lleguen).

### Ventana de carrera residual (documentada, no resuelta)

El **cálculo** de las métricas (paso previo, en TypeScript) y la
**escritura** (paso RPC) son dos pasos separados, no una única transacción.
Si dos administradores cierran la misma semana casi simultáneamente, ambos
calculan un snapshot (posiblemente con datos ligeramente distintos si un
pedido cambia de estado entre ambos cálculos), pero **el índice único
parcial garantiza que solo uno de los dos `INSERT` tenga éxito** — el
segundo recibe un error de conflicto limpio (`WC001`, mapeado a HTTP 409),
nunca una segunda fila activa. Esto es exactamente el mismo patrón y el
mismo nivel de garantía que `docs/SMELLME_OFFERS_ATOMICITY_PROPOSAL.md`
documentó para el máximo de ofertas, aplicado aquí a "nunca dos cierres
activos del mismo período" — la garantía real es sobre la **unicidad**, no
sobre qué snapshot exacto gana la carrera. Riesgo aceptado: es una
operación administrativa infrecuente (una vez por semana), no transaccional
de dinero de clientes.

## RPC de reapertura: `reopen_weekly_closure_v1`

Firma: `(p_closure_id uuid, p_reason text, p_admin_email text, p_admin_nombre
text) returns cierres_semanales`.

1. `select ... for update` sobre la fila (bloqueo de fila real, no en
   aplicación) para serializar reaperturas concurrentes de la misma fila;
2. exige `status = 'CLOSED'` (si no, error `WC002` — cierre inexistente,
   `WC003` — ya reabierto, según corresponda);
3. exige `p_reason` entre 5 y 500 caracteres (trim) — error `WC004` si no
   cumple;
4. `update ... set status = 'REOPENED', reopened_at = now(),
   reopened_by_email = p_admin_email, reopened_by_nombre = p_admin_nombre,
   reopen_reason = p_reason` — nunca toca las columnas de métricas ni
   `snapshot_json`;
5. libera el índice único parcial automáticamente (la fila deja de tener
   `status = 'CLOSED'`), permitiendo un nuevo cierre (versión siguiente) del
   mismo período.

**Política sobre reabrir dos veces**: se eligió **conflicto explícito**
(`WC003`, HTTP 409) en vez de idempotencia silenciosa. Motivo: dos
solicitudes de reapertura con motivos distintos son ambiguas — silenciar la
segunda ocultaría cuál motivo quedó realmente registrado. Un conflicto
explícito es más seguro para una acción auditada.

Un cierre no puede reabrirse si ya existe una versión `CLOSED` más nueva del
mismo período: estructuralmente imposible de violar, porque el índice único
parcial garantiza que solo puede existir una fila `CLOSED` a la vez — para
que exista una versión 2 `CLOSED`, la versión 1 ya debe estar `REOPENED`
(nunca `CLOSED`), así que intentar reabrir la versión 1 en ese estado ya
falla por el chequeo de `status = 'CLOSED'` del paso 2.

## Administrador (auditoría)

Se seguye exactamente el patrón ya usado por
`services/adminMaintenanceService.ts` / `admin_cerrar_mes_operativo`:
`closed_by_email`/`closed_by_nombre` (y `reopened_by_*`) almacenan el
`email`/`nombre` de `getAuthenticatedAdmin()` (`lib/admin-auth.ts`), nunca un
token, nunca una sesión. Ambas columnas son **nullable**: si por cualquier
razón no puede resolverse la identidad del admin en el momento exacto de la
llamada, el cierre o la reapertura **no se bloquean** — simplemente quedan
sin ese dato, documentado como limitación (no existe una tabla de perfiles
administrativos más estable que `usuarios_admin` en este proyecto).

## Migración preparada, no aplicada

Archivo: `supabase/migrations/20260810000000_smellme_weekly_admin_closures.sql`.

- Solo `CREATE TABLE IF NOT EXISTS`, constraints, índices, `CREATE OR
  REPLACE FUNCTION` para las dos RPC, `ENABLE ROW LEVEL SECURITY`,
  políticas y `GRANT`/`REVOKE`.
- Sin `INSERT`, `UPDATE` o `DELETE` de datos existentes, sin tocar
  `pedidos`, `pedido_items`, `pagos`, `fiados`, `clientes`, `productos`,
  `es_top`/`es_oferta_semana`, ni la banlist.
- RLS: sin acceso `anon`; lectura administrativa vía política `for select
  to authenticated using (public.is_active_admin())` (mismo patrón que
  `pedidos`/`clientes`); las dos funciones son `security definer` y solo
  `service_role` tiene `execute`, igual que el resto de las RPC del
  proyecto — la escritura real (cerrar/reabrir) siempre pasa por el
  servidor (rutas API), nunca directamente desde el navegador.
- La migración aditiva está aplicada en remoto; no modifica datos
  comerciales existentes y los cierres siguen requiriendo confirmación
  explícita del administrador (nunca se ejecutan automáticamente).

## Exportación CSV

Sin dependencias nuevas: un helper puro (`lib/weekly-closures/csv.ts`)
construye el CSV manualmentente (join de campos con `,`, comillas dobles
cuando el valor contiene coma/comilla/salto de línea). Protección explícita
contra CSV injection: cualquier valor de texto (nunca los montos/conteos
numéricos, que siempre son server-side) cuyo primer carácter sea `=`, `+`,
`-` o `@` se prefija con un apóstrofo (`'`) antes de escribirse, neutralizando
la interpretación como fórmula en Excel/Sheets. El motivo de reapertura
**no se exporta** en texto completo — solo se exporta un indicador booleano
("Reabierto: sí/no") para no filtrar contenido administrativo potencialmente
sensible en un archivo descargable. Nombre de archivo:
`smellme-cierre-semanal-{period_start}-v{version}.csv`.

## Privacidad

`snapshot_json`, `closed_by_*`, `reopened_by_*` y `reopen_reason` son
exclusivamente administrativos: nunca se incluyen en `/api/products`,
`/api/orders`, el catálogo, el carrito ni el pedido público. Los logs de
servidor solo registran `closureId`, período, versión y código de error —
nunca RUT/teléfono/correo/dirección de clientes (los cierres no almacenan
PII de clientes en absoluto, solo agregados numéricos).

## Fuera de alcance de esta fase

- QA visual autenticado en el Preview de la rama.
- Una consulta de repositorio con rango de fechas real a nivel de base de
  datos: por ahora el cálculo del snapshot reutiliza el mismo patrón
  "traer todo por estado, filtrar en servicio" que ya usa
  `PedidoService.obtenerDashboardAdmin()` — funciona correctamente con el
  volumen de datos actual pero es una
  limitación de escalabilidad conocida y documentada, no un error: una fase
  futura debería añadir una consulta indexada por rango de fechas si el
  volumen de pedidos lo justifica.
- Cambios a Top 15, Ofertas (su riesgo de atomicidad documentado en
  `docs/SMELLME_OFFERS_ATOMICITY_PROPOSAL.md` se conserva intacto y sin
  resolver, a propósito) o a la banlist de clientes (`docs/
  SMELLME_CUSTOMER_BANLIST_DESIGN.md`, también intacta).
- Pedidos y operación (Fase 7.7), catálogo e imágenes reales (Fase 7.8).
