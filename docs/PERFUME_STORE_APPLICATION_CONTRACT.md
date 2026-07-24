# Contrato de aplicación — Fase 1B

- Fecha: 2026-07-24
- Rama: `feature/perfume-store-foundation`
- Fase anterior: Fase 1A (fundación SQL), commit `8cb08c0`, tag `perfume-store-db-foundation-v0.2.0`
- Alcance de esta fase: código TypeScript (dominio, repositorios, servicios, rutas API, formulario público, administración mínima, WhatsApp), pruebas y documentación. **No se tocó SQL, migraciones, `schema.sql`, `seed.sql`, branding, `public/`, `package-lock.json`, `.env` ni Supabase remoto.**

## 1. Objetivo

Reconciliar la aplicación TypeScript heredada de Pauli Store con el contrato de base de datos consolidado en la Fase 1A (`supabase/migrations/20260724000000_perfume_store_foundation.sql`): nuevo dominio de cliente con datos de despacho, nuevo ciclo de vida de pedido (NUEVO→AGENDADO→PAGADO→PREPARANDO→DESPACHADO→ENTREGADO, con CANCELADO desde cualquier estado previo a ENTREGADO), cálculo de despacho centralizado y recalculo de precios/totales en servidor. Esta fase **no** implementa la transacción PostgreSQL de reserva de stock (eso es Fase 1C).

## 2. Archivos modificados

Todos dentro de los directorios permitidos (`domain/`, `repositories/`, `services/`, `lib/`, `app/api/`, `components/OrderForm.tsx`, `components/admin/` cuando fue necesario, `config/`, `tests/`, `package.json` solo para el project-ref, y este documento):

- **Dominio**: `domain/Cliente.ts`, `domain/Producto.ts`, `domain/Pedido.ts` (`domain/DetallePedido.ts`, `domain/Venta.ts`, `domain/CuentaFiado.ts` no requirieron cambios estructurales)
- **Tipos y constantes**: `lib/constants.ts`, `lib/types.ts`, `lib/rut.ts` (nuevo)
- **Validación e identidad**: `lib/validators.ts`, `lib/customers/identity.ts`
- **Catálogo/estado local**: `lib/local-store.ts`, `lib/mocks/products.ts`, `lib/product-catalog.ts`, `lib/admin-customers-data.ts`
- **Repositorios**: `repositories/productRepository.ts`, `repositories/pedidoRepository.ts`, `repositories/clienteRepository.ts`
- **Servicios**: `services/pedidoService.ts`, `services/productoService.ts`, `services/adminCustomerService.ts`, `services/adminMaintenanceService.ts`, `services/NotificationService.ts`, `services/whatsapp/ManualWhatsAppProvider.ts`
- **WhatsApp**: `lib/whatsapp/buildOrderConfirmationMessage.ts`, `lib/whatsapp/buildAdminOrderAlertMessage.ts`
- **Config (neutralización de datos reales de Pauli)**: `config/paymentInfo.ts`, `config/whatsappMessages.ts`
- **API**: `app/api/admin/orders/[pedidoId]/route.ts`, `app/api/admin/products/route.ts`, `app/api/admin/products/[productId]/route.ts`, `app/api/admin/customers/[customerId]/route.ts`, `app/api/admin/push/test/route.ts` (`app/api/orders/route.ts`, `app/api/products/route.ts`, `app/api/admin/orders/route.ts`, `app/api/admin/customers/route.ts`, `app/api/admin/direct-sales/route.ts`, `app/api/admin/custom-orders/route.ts` no requirieron cambios: son pass-through delgados)
- **Formulario público**: `components/OrderForm.tsx` (reescritura sustancial)
- **Administración (cambios mínimos y dirigidos)**: `components/admin/AdminDashboard.tsx`, `components/admin/AdminDirectSale.tsx`, `components/admin/dashboard/DashboardPresentation.tsx`
- **`package.json`**: solo el script `supabase:link` (se quitó el `project-ref` heredado de Pauli Store)
- **Pruebas**: ver sección de pruebas más abajo
- **Documentación**: este archivo

## 3. Contrato de cliente

```ts
type ClienteProps = {
  id?: string;
  nombre: string;          // obligatorio
  rut?: string;             // normalizado con lib/rut.ts, formato "12345678-5"
  email?: string;
  telefono?: string;        // normalizado a e164 chileno (+56...)
  region?: string;
  comuna?: string;
  direccion?: string;
  referenciaDireccion?: string;
  lugarTrabajo?: string;    // LEGADO de Pauli Store, ver nota abajo
  createdAt?: Date;
  updatedAt?: Date;
};
```

`lugarTrabajo` se conserva **solo** como compatibilidad temporal: ya no es obligatorio a nivel de dominio ni de base de datos, no se pide en el formulario público, y **no se usa como dirección**. Sigue existiendo porque `venta directa` y `pedido personalizado` (flujos admin heredados, fuera del flujo principal) todavía lo usan para identificar clientes ocasionales sin dirección real.

## 4. Contrato de producto

```ts
type ProductoProps = {
  id: string;
  sku?: string;
  nombre: string;
  marca?: string;
  contenido?: string;         // ej. "100ml"
  descripcion?: string;
  precioVenta: number;
  precioAnterior?: number;
  costoUnitario?: number;
  stockActual?: number;
  stockAgenda?: number;       // LEGADO de Pauli Store, espejo de stockActual
  stockReservado?: number;    // estructural, sin logica de reserva todavia
  stockMinimo?: number;
  activo?: boolean;
  esTop?: boolean;
  esOfertaSemana?: boolean;
  ordenDestacado?: number;
  tipoProducto?: string;
  imageUrl?: string;
  imageStoragePath?: string;
  badgeLabel?: string;
  createdAt?: Date;
  updatedAt?: Date;
};
```

`esTop`/`esOfertaSemana`/`ordenDestacado` ya están en el contrato y se persisten (repositorio y servicio), pero **no hay todavía ninguna pantalla de Top 10 ni de Ofertas de la semana**: eso es UI pendiente para una fase posterior, tal como pedía esta fase ("deja el contrato preparado, no implementes la interfaz").

`lib/mocks/products.ts` (catálogo local usado cuando Supabase no está configurado, incluido en las pruebas) se reemplazó: ya no contiene dobladitas/quequitos de Pauli Store, ahora tiene 6 perfumes de ejemplo genéricos (sin marcas reales) que ejercitan sku, marca, contenido, precioAnterior, esTop, esOfertaSemana y un producto inactivo con precio pendiente.

## 5. Contrato de pedido

```ts
type Pedido = {
  id?: string;
  codigo?: string;             // ej. "PS-20260724-A1B2C3"
  cliente: Cliente;
  items: DetallePedido[];
  metodoDespacho: "STARKEN_POR_PAGAR" | "DOMICILIO_SEMANAL";
  subtotal: number;            // calculado, suma de items
  costoDespacho: number;       // calculado por metodoDespacho
  total: number;                // subtotal + costoDespacho
  estadoPedido: EstadoPedido;
  estadoPago: EstadoPago;
  observacion?: string;
  motivoCancelacion?: string;
  stockRepuesto: boolean;       // idempotencia de reposicion en cancelacion
  fechaPedido: Date;
  fechaAgendado?: Date;
  fechaPago?: Date;
  fechaPreparacion?: Date;
  fechaDespacho?: Date;
  fechaEntrega?: Date;          // fecha REAL de entrega, no una fecha elegida por el cliente
  fechaCancelacion?: Date;
};
```

## 6. Contrato de pedido_items (snapshot)

Cada línea de pedido conserva un snapshot del producto vía `DetallePedido.producto` (una instancia de `Producto` construida con los datos del momento de la compra, no una referencia viva). Al persistir (`repositories/pedidoRepository.ts`), se guardan como columnas independientes: `productoId` (nullable), `productoSku`, `productoNombre`, `productoMarca`, `productoContenido`, `productoDescripcion`, `productoImageUrl`, `productoTipo`, `cantidad`, `precioUnitario`, `subtotal`, y — por compatibilidad con reportes de utilidad heredados — `costoUnitario`, `totalCosto`, `utilidadBruta`. El pedido histórico no cambia si el producto se edita o se elimina después: `producto_id` puede quedar `null` (ver Fase 1A, `pedido_items.producto_id on delete set null`).

## 7. Estados

**Pedido** (`lib/constants.ts`, `ESTADOS_PEDIDO` / `ESTADO_PEDIDO_LABELS`):

| Valor | Etiqueta |
|---|---|
| `NUEVO` | Nuevo |
| `AGENDADO` | Agendado |
| `PAGADO` | Pagado |
| `PREPARANDO` | Preparando |
| `DESPACHADO` | Despachado |
| `ENTREGADO` | Entregado |
| `CANCELADO` | Cancelado |

`PENDIENTE`, `FINALIZADO` y `FIADO` (como estado de pedido) **ya no existen** en ningún punto del nuevo flujo de creación/transición.

**Pago** (`ESTADOS_PAGO` / `ESTADO_PAGO_LABELS`): `SIN_PAGO`, `PAGADO`, `CANCELADO`. `FIADO` ya no es un valor válido de `estadoPago` (coincide con el `CHECK` de la Fase 1A).

## 8. Transiciones

Centralizadas en `lib/constants.ts` (`ESTADO_PEDIDO_TRANSICIONES`) y aplicadas por `domain/Pedido.ts` (`validarTransicionEstado`):

```text
NUEVO      -> AGENDADO, CANCELADO
AGENDADO   -> PAGADO, CANCELADO
PAGADO     -> PREPARANDO, CANCELADO
PREPARANDO -> DESPACHADO, CANCELADO
DESPACHADO -> ENTREGADO, CANCELADO
ENTREGADO  -> (terminal)
CANCELADO  -> (terminal)
```

Reglas de pago:

- `NUEVO`/`AGENDADO` deben iniciar `SIN_PAGO` (validado en el constructor de `Pedido`).
- `marcarPagado()` (AGENDADO→PAGADO) fija `estadoPago = PAGADO` y `fechaPago`.
- `cancelar(motivo, { confirmarPagoPerdido })`: si el pedido ya está `estadoPago = PAGADO`, **lanza un error** a menos que se pase `confirmarPagoPerdido: true` explícitamente — nunca se cancela un pedido pagado en silencio. Si el pedido estaba `SIN_PAGO`, cancelar también deja `estadoPago = CANCELADO` (ya no queda "flotando" sin pago en un pedido cerrado).
- Excepción documentada: **venta directa** puede construir un pedido ya en `ENTREGADO` con `estadoPago = SIN_PAGO` cuando queda "fiado" (entrega en persona, cobro pendiente rastreado en la tabla `fiados`, no en `estadoPago`). Ver sección 15.

## 9. Métodos de despacho

`METODOS_DESPACHO` = `STARKEN_POR_PAGAR` | `DOMICILIO_SEMANAL` (`lib/constants.ts`).

- `calcularCostoDespacho(metodoDespacho)`: Starken → siempre `0` ("por pagar" en destino); Domicilio semanal → `DOMICILIO_SEMANAL_COSTO_FALLBACK` (hoy `4000`, comentado explícitamente como **fallback temporal** — la fuente definitiva es `business_settings.costo_despacho_semanal`, que todavía no tiene repositorio/servicio TypeScript conectado en esta fase).
- Es la **única** función/constante que define el monto de despacho; no está repetido en ningún componente ni servicio.
- El costo se suma una sola vez por pedido (`Pedido.costoDespacho`), nunca una vez por línea de producto.

## 10. Cálculo de totales

`domain/Pedido.ts`: `subtotal = Σ item.subtotal` (cada `item.subtotal = precioUnitario * cantidad`, con `precioUnitario` tomado siempre del producto real, nunca del cliente); `costoDespacho = calcularCostoDespacho(metodoDespacho)` salvo que se pase explícitamente (usado por `crearVentaDirecta`, que fuerza `0`); `total = subtotal + costoDespacho`. Todo el cálculo ocurre en `PedidoService.crearPedido` / `crearVentaDirecta` / `crearPedidoPersonalizado`, en el servidor, usando los productos leídos del repositorio — nunca valores enviados por el formulario.

## 11. Validación del servidor

`PedidoService.crearPedido` (flujo público), en orden:

1. `validateCustomerOrderForm` (nombre, RUT, correo, teléfono, región, comuna, dirección, método de despacho, items) contra el catálogo real leído del repositorio.
2. Normaliza teléfono (`parseChileanMobilePhone`) y RUT (`parseChileanRut`); rechaza si no son válidos aunque el validador de formulario ya los haya revisado (defensa en profundidad, ya que el validador y el servicio pueden evolucionar por separado).
3. Valida correo (`isValidEmail`).
4. Valida método de despacho contra el enum (`isMetodoDespacho`).
5. Por cada línea: el producto debe existir, estar activo, cantidad entera ≥ 1, y no exceder el stock disponible leído del repositorio.
6. Construye `Producto`/`DetallePedido` con **el precio del repositorio**, nunca con un precio enviado por el cliente (`CustomerOrderRequest` ni siquiera declara un campo de precio).
7. Crea el `Pedido` (subtotal/despacho/total se calculan dentro del constructor de dominio).
8. Persiste cliente, pedido, items y descuenta stock (ver limitación de atomicidad, sección 12).

Las rutas API (`app/api/orders/route.ts`) además aplican: origen confiable (`validateTrustedOrigin`), `Content-Type` JSON, honeypot (`contactoOculto`), y rate limit por IP y por teléfono. Las rutas admin (`app/api/admin/orders/[pedidoId]/route.ts`) exigen `isAdminAuthenticated()` y despachan a un `switch` cerrado de acciones (`agendar`, `pagado`, `preparando`, `despachado`, `entregado`, `cancelar`, `abonar`, `visto`) — no aceptan un string de estado arbitrario desde el cliente, y ya no existe una acción `"fiado"` para el flujo principal de pedidos.

## 12. Estrategia temporal de stock

**No atómica.** `PedidoService.crearPedido` descuenta stock con `Promise.all(items.map(item => productRepository.ajustarStockAgenda(...)))`: son N escrituras independientes al repositorio, sin bloqueo de filas ni transacción. Dos compras simultáneas del mismo producto pueden pisarse y provocar sobreventa. Esto es exactamente el mecanismo heredado de Pauli Store, mantenido **únicamente** para no romper los tests existentes y la compatibilidad funcional mientras no exista la RPC transaccional (Fase 1C).

**No se afirma en ningún lugar del código ni de esta documentación que la sobreventa esté resuelta.** El comentario de cabecera de `services/pedidoService.ts` lo declara explícitamente. `productos.stock_reservado` (Fase 1A) existe en la base pero ningún código TypeScript lo escribe todavía.

No se implementó ningún lock simulado en memoria (ni un `Map` de "productos bloqueados", ni un mutex por proceso): eso habría dado una falsa sensación de seguridad sin proteger nada entre instancias serverless distintas, que es exactamente el riesgo real en Vercel.

## 13. Limitaciones no resueltas

1. **Sobreventa no resuelta** (sección 12) — pendiente para Fase 1C.
2. **Agrupamiento de pedidos agendados por fecha de entrega** (`agendaGroups`, sección "Entregas de hoy" en `AdminDashboard.tsx`, líneas ~330-410 y ~3440-3510): este código asumía, como en Pauli Store, que `fecha_entrega` se llena al agendar. En el nuevo esquema `fecha_entrega` es la fecha **real** de entrega (solo se llena al llegar a `ENTREGADO`), porque el cliente ya no elige una fecha de entrega en el formulario público (el despacho se coordina por WhatsApp). Esa función sigue compilando y no rompe nada, pero queda mostrando siempre "sin agendar"/vacío para pedidos `AGENDADO`. Rediseñarla implica tocar más a fondo `AdminDashboard.tsx`, explícitamente fuera de alcance de esta fase ("no rediseñes todavía todo AdminDashboard.tsx").
3. **Sin selector de método de despacho para venta directa ni pedido personalizado**: ambos flujos admin heredados usan un despacho de respaldo fijo (`METODO_DESPACHO_SIN_ENVIO = STARKEN_POR_PAGAR`, costo 0) porque son ventas/pedidos sin envío real capturado hoy. Documentado en el propio código (`services/pedidoService.ts`).
4. **Región/comuna son campos de texto libre**, no un selector en cascada con el listado oficial de regiones/comunas de Chile. Cumple la validación pedida (no vacíos) pero no impide errores de tipeo. Mejora pendiente para una fase posterior.
5. **`business_settings` sin integración TypeScript**: el costo de despacho semanal sigue siendo una constante en código (`DOMICILIO_SEMANAL_COSTO_FALLBACK`), no un valor leído de la base. Los datos bancarios (`config/paymentInfo.ts`) están vacíos a propósito por el mismo motivo.
6. **`pagos.estado_pago` sigue sin `CHECK` en la base** (decisión de la Fase 1A) porque el código heredado (`registrarAbonoFiado`) puede necesitar valores fuera del enum de `pedidos.estado_pago`.
7. El modal "Agendar pedido" en `AdminDashboard.tsx` ya no pide una fecha (se reemplazó por un texto explicativo), porque `agendarPedido` ya no acepta una fecha — evita el problema mayor (un campo que el backend ignoraba en silencio) pero es un cambio de UX que no se probó visualmente (no hay navegador disponible en esta fase).

## 14. Incompatibilidades eliminadas

- `ESTADO_PEDIDO_PENDIENTE`, `ESTADO_PEDIDO_FINALIZADO`, `ESTADO_PAGO_FIADO` (como estado de **pedido**) ya no existen en `lib/constants.ts` ni se usan en ningún flujo de creación/transición de pedidos.
- La acción admin `"fiado"` (marcar un pedido agendado del flujo público como fiado) se eliminó por completo: tipo `AdminOrdersAction`, método `PedidoService.marcarPedidoFiado`, caso del switch en la API, botón "Dejar fiado" en `AdminDashboard.tsx`. Ya no es posible dejar fiado un pedido público desde el panel.
- `CustomOrderRequest.estadoInicial` y las opciones de `AdminDirectSale.tsx` para pedido personalizado pasaron de `PENDIENTE | AGENDADO | PAGADO | FIADO` a `NUEVO | AGENDADO | PAGADO` (sin FIADO).
- `lib/customers/identity.ts` ya no contiene los alias hardcodeados de clientes reales de Pauli Store (`Paty`→`Patricia Diaz`, `Loreto Looez`→`Loreto Lopez`, `yo`/`cliente ocasional`/`Pauli`→`Pauli`, `camila montes`→`Camila Montes`). La normalización ahora es genérica: telefono > RUT > correo > nombre (nombre nunca es suficiente por sí solo). Ver `tests/lib/customerIdentity.test.ts`.
- `config/paymentInfo.ts` ya no contiene los datos bancarios reales de la dueña de Pauli Store (nombre, RUT, banco, número de cuenta, correo personal). Quedó vacío a propósito.
- `config/whatsappMessages.ts` ya no apunta a `https://pauli-store-clientes.vercel.app/` (URL de producción real de otro negocio) ni menciona "dobladitas".

## 15. Módulos legados conservados

| Módulo | Clasificación | Nota |
|---|---|---|
| `fiados` (tabla + `registrarAbonoFiado` + `upsertFiado`) | Legado, fuera del MVP público | Se conserva porque venta directa todavía lo usa para ventas en persona a crédito. No alcanzable desde el flujo público. |
| Venta directa (`AdminDirectSale.tsx`, `crearVentaDirecta`) | Puede mantenerse temporalmente | Ventas presenciales; ahora crea el pedido directo en `ENTREGADO` (se lleva el producto en el acto) con `PAGADO` o `SIN_PAGO`+registro en `fiados`. |
| Pedido personalizado (`crearPedidoPersonalizado`) | Fuera del flujo principal | `estadoInicial` limitado a `NUEVO`/`AGENDADO`/`PAGADO`; sin despacho real capturado (ver limitación 3). |
| `lugarTrabajo` en `Cliente` | Legado temporal | Ver sección 3. |
| `stock_agenda` en `Producto` | Legado, compatibilidad | Espejo de `stock_actual` mantenido por el repositorio, tal como en Pauli Store. |

## 16. Preparación para la RPC de stock (Fase 1C)

Estructuralmente listo:

- `productos.stock_reservado` (columna, sin lógica que la use).
- `pedidos.stock_repuesto` (columna, usada para evitar doble reposición en `PedidoService.cancelarPedido` — el servicio TypeScript ya respeta esta bandera y **no** repone si ya está en `true`).
- El contrato de la futura función transaccional está documentado en `docs/PERFUME_STORE_DATABASE_FOUNDATION.md`, sección 12 (bloqueo de filas, recálculo de precios en servidor, snapshot, todo-o-nada).

Lo que falta para Fase 1C:

- Escribir y **probar contra una base Postgres real** la función `SECURITY DEFINER` de reserva/creación de pedido.
- Decidir si la creación pública de pedidos migra de "server + repositorio" a "RPC atómica" (cambiaría la forma de `PedidoService.crearPedido`, hoy dejada con una interfaz clara para ese reemplazo: normaliza, valida y arma el pedido antes de las escrituras, que es exactamente lo que necesitaría envolver una transacción).
- Escribir la función de cancelación con reposición idempotente en SQL (hoy la idempotencia vive solo en TypeScript vía `stock_repuesto`, sin garantía transaccional real ante condiciones de carrera).

## 17. Checklist para Fase 1C

- [ ] Diseñar y probar (contra una base Postgres real, no solo lectura de código) la función `SECURITY DEFINER` de reserva de stock.
- [ ] Decidir si `PedidoService.crearPedido` pasa a invocar esa RPC en vez de las escrituras independientes actuales.
- [ ] Escribir la función de cancelación con reposición idempotente en SQL, coherente con `pedidos.stock_repuesto`.
- [ ] Resolver el agrupamiento de pedidos por fecha (sección 13, limitación 2) o retirar esa sección de `AdminDashboard.tsx` si ya no aplica al negocio de perfumes.
- [ ] Conectar `business_settings` (repositorio + servicio TypeScript) para reemplazar `DOMICILIO_SEMANAL_COSTO_FALLBACK` y los datos bancarios vacíos de `config/paymentInfo.ts`.
- [ ] Evaluar un selector de región/comuna con el listado oficial en vez de texto libre.
- [ ] Revisar visualmente en navegador el nuevo `OrderForm.tsx` y el modal "Agendar pedido" de `AdminDashboard.tsx` (no se pudo probar visualmente en esta fase).
- [ ] Decidir el futuro de `fiados`/venta directa/pedido personalizado (mantener, formalizar o retirar) una vez que el MVP de perfumes tenga volumen real.

No se incluyen secretos ni valores reales en este documento.
