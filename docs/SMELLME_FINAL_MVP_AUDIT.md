# Smellme.cl — Auditoría integral del MVP (previa a producción)

Rama: `feature/final-mvp-audit`. Base: `2603109` (cierre de Fase 3B.3).
Fecha: 2026-07-31. Auditoría de solo lectura — no se modificó ningún
producto, precio, stock, posición de Top 12 ni configuración real.
Los datos citados vienen de una consulta directa de solo lectura al
proyecto Supabase remoto (`nxgkudvrotlaqvvhygem`) y de revisión de código
por tres agentes de investigación en paralelo (storefront público, panel
admin + notificaciones, seguridad + reportes/costos/stock), más revisión
directa de la documentación existente.

---

## 1. Resumen ejecutivo

El MVP funcional está mayormente construido y probado (935 pruebas
automatizadas en verde a la fecha de esta auditoría, contando las 730 de
3B.3 más las que ya existían de fases anteriores — ver nota de método más
abajo), con una arquitectura transaccional sólida (RPC atómicas para
pedidos, venta directa, pago y cancelación, todas con bloqueo determinista
de filas e idempotencia real). Sin embargo, **el sistema no está listo
para operar con clientes reales todavía**, por tres motivos concretos e
independientes entre sí:

1. **Dato de negocio faltante que bloquea la operación**: la configuración
   bancaria (`business_settings`) está completamente vacía en producción.
   Sin ella, la acción "Atender y solicitar transferencia" rechaza
   *todos* los pedidos públicos con `422 CONFIG_INCOMPLETA`. Esto no es un
   bug de código — es un dato real que el dueño del negocio debe cargar en
   `/admin/configuracion` antes de operar.
2. **Un bug de datos crítico en una posición pública destacada**: la
   posición #4 del Top 12 apunta a una fila de producto vacía (sin marca,
   sin contenido, sin SKU) en vez del perfume real y completo con el mismo
   nombre.
3. **Una tarea administrativa core sin camino de UI alcanzable**: hoy no
   existe ninguna pantalla funcional para dar de alta un producto nuevo
   fuera de la importación masiva por CSV — la única vista que lo permitía
   quedó huérfana tras una redirección de una fase anterior.

Ninguno de los tres requiere una reescritura grande: son correcciones
acotadas (cargar datos reales, corregir una fila, restaurar o reconstruir
un formulario). El resto de los hallazgos —fricciones de UX, deuda de
navegación, gaps de seguridad defensiva, ausencia de trazabilidad de
costos— son reales pero no bloquean un primer lanzamiento controlado si se
abordan en el orden propuesto en la sección 17.

**Nota de método:** esta auditoría es de código y datos, no incluye
pruebas manuales en navegador del storefront público (se revisó el código
y las clases responsive, no se tomaron capturas de pantalla reales en
390/768/1440px). Los hallazgos de layout están basados en las clases
Tailwind usadas, no en verificación visual.

---

## 2. Estado funcional (visión rápida)

| Área | Estado |
|---|---|
| Pedido público (cliente) | Funcional, con fricción de formulario y sin canal de WhatsApp directo (§4) |
| Operación de pedidos (admin) | Funcional y ya documentada (Fase 3B.1) — atender/reenviar/confirmar/coordinar/cancelar, bloqueada hoy solo por falta de datos bancarios |
| Venta directa (mostrador) | Funcional, transaccional, con idempotencia real (Fase 3B.2) |
| Pedidos personalizados | Funcional, sin cambios recientes |
| Subida de imágenes de producto | Funcional, probada en Vercel real (Fase 3B.3) |
| Alta de producto nuevo manual | **Roto** — sin camino de UI alcanzable (§5, §14) |
| Top 12 | Funcional pero con un dato corrupto en una posición (§3) |
| Configuración bancaria | Pantalla funcional, **dato real no cargado** (§3, §7) |
| Notificaciones (badge + push) | Funcionales; push no hace deep-link al pedido específico (§8) |
| Reportes/conciliación | Lógica correcta (sin doble conteo, cancelados excluidos), con una garantía transaccional no probada contra Postgres real (§9, §10) |
| Seguridad | Postura sólida en general; CSP debilitada y dependencias con CVEs altos en rutas activas (§13) |

---

## 3. Datos del catálogo

Consulta directa de solo lectura contra la tabla `productos` real (106
filas), sin modificar nada.

### Tabla resumen

| Métrica | Valor |
|---|---|
| Total productos | 106 |
| Activos / Pausados | 104 / 2 (los 2 pausados son productos `ZZTEST-*` de QA de fases anteriores, ya inofensivos) |
| Sin precio | 0 |
| Sin costo | 2 (los mismos `ZZTEST-*`) |
| Sin stock | 0 |
| **Sin imagen** | **102 de 106 (96%)** |
| Sin marca / sin contenido / sin SKU | 2 reales (no son los `ZZTEST-*`, ver hallazgo crítico abajo) |
| Nombres duplicados | 10 grupos (7 son variantes legítimas de una misma familia, 3 son problemas de datos) |
| SKU duplicados (entre los no vacíos) | 0 |
| Familias con variantes | 7 de 98 familias únicas |
| Top 12 asignado | 4 de 12 posiciones (ranks 1, 3, 4, 7) |
| Ofertas de la semana | 0 |
| Modo de precio | 105 AUTO, 1 MANUAL |
| Precio ≤ costo | 0 casos |
| Costos muy repetidos (posible default/estimado) | 55000 (19 productos), 50000 (10), 60000 (7), 65000 (6), 28000 (5) |
| Stock negativo / reservado &gt; actual | 0 / 0 (invariantes sanos) |
| Pedidos totales en el sistema | 3 (2 `PUBLICO`, 1 `ADMIN_DIRECTO` — este último es la venta de prueba de QA de 3B.2) |
| Clientes totales | 2 |
| Fiados | 0 |

### Hallazgo crítico — fila fantasma en Top 12 rank #4

Existen dos pares de filas duplicadas donde una fila está vacía en
marca/contenido/SKU pero conserva precio y costo:

- **`212 Forever Young Hombre`**: fila real y completa (Carolina Herrera,
  150ML, SKU real) **vs.** fila vacía (`marca=""`, `contenido=""`,
  `sku=null`) que es exactamente la que está vinculada a **Top 12 posición
  #4** (`es_top=true`, `orden_destacado=4`).
- **`"y" EDT`**: mismo patrón (fila real Yves Saint Laurent 100ML vs. fila
  vacía), aunque esta segunda no está vinculada a Top 12 actualmente.

**Consecuencia:** la posición #4 del Top 12 —una posición prominente y
pública— muestra un producto sin marca ni contenido, que probablemente no
pasa el filtro de completitud del catálogo público
(`isProductMetadataComplete`), mientras el perfume real y bien cargado
queda huérfano, sin ranking. Origen probable: al vincular Top 12 se creó
una fila nueva en vez de reutilizar el producto ya existente en el
catálogo regular.

**Severidad: crítico.**

### Otros duplicados de nombre

- **`Libre`** (Yves Saint Laurent): dos filas **ambas con datos completos**
  (90ML, mismo precio) pero con la marca escrita distinto — "Yves Saint
  Lauren" vs. "Ives Saint Lauren" (typo). Como el agrupamiento de familias
  usa marca+nombre normalizados, estas dos filas nunca se reconocen como
  la misma familia: **el mismo perfume aparece dos veces en el catálogo
  público**. Severidad: **alto**.
- Los otros 7 grupos duplicados son variantes legítimas (mismo perfume,
  distinta presentación: Lady Fabulous, Lady Million, 212 VIP Rose, Aqua
  Di Gio Profondo EDP, Ralph Club, Stronger With You Intensely, CHHC Eau
  De Toilete) — correctamente agrupadas por el sistema de familias, sin
  acción requerida.
- **Dato comercial pendiente:** el nombre de marca "Yves Saint Lauren"
  (sin la "t" final) se repite consistentemente así en varios productos —
  no parece un typo aislado sino cómo se cargó originalmente. Confirmar
  con el negocio si debe normalizarse a "Yves Saint Laurent".

### Configuración bancaria (`business_settings`) — vacía

Los 6 campos de transferencia (banco, tipo de cuenta, número de cuenta,
titular, RUT del titular, correo) están **todos vacíos** en producción.
Confirmado también que el grant de columnas mínimas de la migración
`20260731000000` sigue activo y correcto: `service_role` recibió un error
de permiso al intentar leer una columna no otorgada
(`costo_despacho_semanal`), lo cual es la conducta esperada, no un bug.

**Consecuencia funcional directa:** la acción "Atender y solicitar
transferencia" (Fase 3B.1) responde `422 CONFIG_INCOMPLETA` para *todo*
pedido público hasta que se complete `/admin/configuracion`.

**Severidad: crítico** (bloquea la operación) y **dato comercial
pendiente** (requiere que el dueño del negocio provea sus datos bancarios
reales — el código ya está listo para recibirlos).

### Sin imagen: 96% del catálogo

102 de 106 productos no tienen foto. El pipeline de subida (Fase 3B.3) ya
funciona; falta el trabajo operativo de cargar las fotos, uno por uno hoy.
Es la motivación directa del diseño del Asistente de Imágenes (§16).

### Actividad real

Solo 3 pedidos y 2 clientes existen en todo el sistema — consistente con
un negocio en fase de preparación, sin tráfico de clientes real todavía.
Esto significa que **ningún flujo de reportes/conciliación ha sido
ejercitado con datos de producción real**; toda la confianza en esos
cálculos viene de las pruebas automatizadas y la revisión de código, no de
un historial real observado.

---

## 4. Tienda pública

*(Findings del agente de auditoría de storefront; ver también §12 para lo
específico de mobile/accesibilidad.)*

- **Sin botón/canal de WhatsApp en el storefront público.**
  `WhatsAppFloatingButton.tsx` existe en el código pero **solo se usa en
  el panel admin** (`AdminDashboard.tsx`) — el cliente público no tiene
  ninguna vía de contacto directo por WhatsApp en toda la página, pese a
  que el negocio depende de WhatsApp para confirmar pago y despacho.
  Severidad: **alto**.
- **Paginación del catálogo limitada a 5 ítems sin filtro activo, sin
  botón "ver más" visible**: un usuario que solo quiere hojear el catálogo
  sin buscar nada no puede ver más de 5 productos a menos que escriba algo
  en el buscador o toque un filtro. Es una decisión de diseño documentada
  en el código, pero genera fricción real de descubrimiento. Severidad:
  **alto**.
- **Mensaje de error engañoso**: si falla la carga inicial del catálogo,
  se muestra el toast "No se pudo registrar el pedido..." — un mensaje
  sobre fallo de *envío*, mostrado en el peor momento posible (recién
  abierta la página, sin que el usuario haya hecho nada). Severidad:
  **alto**.
- Branding: **completamente migrado a Smellme.cl** — no se encontró
  ninguna referencia visible a "Pauli Store" en código público (solo
  quedan comentarios de mantenimiento no visibles al usuario). Buen
  resultado del rebranding.
- Formulario de pedido: RUT y correo obligatorios pese a que el pago se
  coordina manualmente por WhatsApp — fricción cuestionable para una
  simple "solicitud de reserva". **Dato comercial pendiente**: confirmar
  si el RUT se usa para boleta/factura; si no, podría diferirse.
- Región/comuna sí son selectores reales (no texto libre) — correcto.
  Autocompletado de "clientes frecuentes" guarda datos personales en
  `localStorage` sin opción de "olvidar mis datos" — medio, privacidad.
- "Total" ambiguo: `CartSummary` muestra "Total" = solo subtotal de
  productos, y el pie de página muestra por separado "Total estimado" =
  subtotal + despacho — dos filas con la palabra "Total" y valores
  distintos visibles en la misma tarjeta. Medio.
- En mobile, el botón flotante puede saltar directo a confirmar el pedido
  sin pasar por el resumen completo si ya está listo para enviar — combinado
  con el punto anterior, el cliente podría confirmar sin ver el desglose
  con despacho incluido. Medio.
- Código muerto confirmado: `components/shared/ProductCatalog.tsx` no
  tiene ningún importador activo (reemplazado por `CatalogExplorer`).
  Bajo, deuda técnica.
- Positivo confirmado: `GET /api/products` no expone costo ni utilidad
  (estructuralmente, el campo ni se incluye en la respuesta, no es un
  filtro post-hoc); expone `stockMinimo` sin uso aparente (bajo, dato
  operativo interno innecesario en el payload público).

---

## 5. Panel administrativo

*(Findings del agente de auditoría admin; alcance explícito: NO reaudita
lo ya documentado de venta directa/config de pago/subida de
imágenes/operaciones de pedido, ya cubierto en sus propios docs.)*

- **Crítico: no existe un camino de UI alcanzable para crear un producto
  nuevo fuera de la importación CSV.** La única vista que lo permitía
  (`AdminDashboard.tsx`, vista legacy `view==="stock"`) quedó huérfana: la
  ruta `/admin/stock` ahora redirige server-side a `/admin/catalogo/stock`
  (`QuickStockPanel`, que no tiene botón de creación), y ningún otro panel
  de catálogo nuevo tiene afordancia de "Nuevo producto". Son ~600 líneas
  de código muerto además del gap funcional.
- **Navegación fragmentada en al menos 4 shells distintos** sin un patrón
  unificado: el riel horizontal principal (`AdminDashboard.tsx`) solo
  cubre 6 de 10 destinos con el mismo estilo/estado activo; los otros 4
  (Venta directa, Pedidos personalizados, Gestión de catálogo, Importar
  catálogo) son links planos sin badge ni estado activo. Desde Venta
  directa, Pedidos personalizados, Importar catálogo o Configuración, el
  admin debe volver a "Inicio" para navegar a cualquier otro módulo — no
  hay barra global persistente. Severidad: **alto**.
- **Manejo de sesión expirada incompleto**: la protección a nivel de
  página funciona bien (cada `page.tsx` revalida y redirige a login), pero
  si la sesión expira mientras el panel ya está abierto, cualquier mutación
  vía `fetch` falla con un error genérico ("No autorizado.") sin acción de
  "volver a iniciar sesión" ni redirección automática. Severidad: **alto**.
- **Push sin deep-link al pedido específico**: la notificación siempre
  navega a `/admin/pedidos` genérico, nunca al pedido puntual, aunque el
  `pedidoId` viaja en el payload — el service worker simplemente no lo
  usa para construir la URL. Severidad: **alto**.
- Inicio (dashboard home) es genuinamente útil (métricas accionables,
  tareas rápidas, alertas), pero no ofrece accesos directos a Venta
  directa ni Pedidos personalizados pese a ser el primer punto de
  contacto diario. Bajo.
- Clientes: deduplicación a nivel de base de datos es sólida (por
  teléfono/RUT/correo normalizados, nunca solo nombre). Pero el
  *agrupamiento visual* de Fiados y Agenda cae a nombre+lugar de trabajo
  cuando falta el teléfono — dos clientes reales sin teléfono y mismo
  nombre/lugar de trabajo genérico podrían ver sus saldos/pedidos
  mezclados en una tarjeta (aunque sus registros en la BD siguen
  separados). Medio.
- Vista de Pedidos (agenda general): sin filtro de rango de fechas ni por
  origen del pedido en la vista operativa diaria (ese filtro solo existe
  en Reportes). Medio.
- Configuración: solo "Transferencia" y "Seguridad" son reales;
  "Contacto", "Despacho" y "Notificaciones" son stubs idénticos con el
  mismo texto de placeholder. **Dato comercial pendiente**, no hay nada
  que auditar en código porque no hay código funcional detrás todavía.
- Sin `window.confirm`/`alert` nativos en ningún lado (buena práctica),
  pero 2 patrones de confirmación conviviendo: el hook compartido
  `useAppFeedback` en algunos paneles, y modales de confirmación
  implementados a mano en los paneles de stock/precio masivo y Top 12.
  Bajo, fragmentación de patrón.
- Permisos: la tabla `usuarios_admin` ya tiene una columna `rol`, pero no
  se usa en ningún lugar del código — todo admin activo tiene privilegios
  idénticos y completos, incluyendo cambiar datos bancarios. **Dato
  comercial pendiente** (depende de si el negocio necesita un rol
  restringido).

---

## 6. Pedidos (flujo operativo)

Ya documentado en profundidad en `docs/SMELLME_ORDER_OPERATIONS_FLOW.md`
(Fase 3B.1) — no se repite aquí. Confirmado en esta auditoría:
funcionalmente correcto y probado, pero bloqueado hoy en producción
únicamente por la falta de datos bancarios reales (§3). La vista general
de "Pedidos" (lista/agenda) carece de filtro por rango de fechas/origen
(§5) — es una limitación de la vista de listado, no del flujo de acciones
en sí.

---

## 7. Venta directa

Ya documentado en `docs/SMELLME_DIRECT_SALE_FAST_FLOW.md` (Fase 3B.2).
Confirmado: transacción atómica real (`create_direct_sale_v1`), idempotencia
verificada tanto en código como en QA real contra Supabase. Único matiz
nuevo de esta auditoría (§10): la garantía de idempotencia está probada
contra un mock en memoria y contra el QA manual ya realizado, pero **no**
contra un test SQL automatizado que corra sobre Postgres real (a
diferencia de la garantía de cancelación, que sí tiene ese nivel de
prueba). No se encontró ningún caso donde una venta directa cuente dos
veces en reportes.

---

## 8. Notificaciones

- **Badge de pedidos pendientes**: correctamente implementado.
  Excluye pedidos ya agendados/atendidos/entregados/cancelados,
  sincroniza por foco/visibilidad/polling de 60s y canal realtime de
  Supabase. Bajo, sin hallazgos.
- **Push**: real y funcional (VAPID configurado, service worker real en
  `public/admin-sw.js`), con fallback silencioso correcto si faltan las
  llaves de entorno. Cobertura por origen de pedido correcta: pedido
  público nuevo badgea, venta directa no badgea (ya está cerrada),
  pedido personalizado badgea solo si nace en estado NUEVO.
- **Deep-link roto**: la notificación siempre abre `/admin/pedidos`
  genérico, nunca el pedido específico, aunque el `pedidoId` viaja en el
  payload. Severidad: **alto** (con varios pedidos pendientes, el admin no
  puede saber cuál abrir desde la notificación).
- **Sin reintentos ni registro de errores de envío**: un fallo de envío
  push (más allá de una suscripción muerta, que sí se desactiva
  automáticamente) se descarta en silencio, sin cola ni log. Aceptable
  para volumen bajo actual, pero sin visibilidad si empieza a fallar
  sistemáticamente. Medio.
- Configuración por dispositivo (silenciar badge, desactivar push) ya
  existe y funciona (`user_device_badge_settings`,
  `admin_push_subscriptions`).
- No se implementó ni se recomienda implementar WhatsApp automático vía
  servicios externos (fuera de alcance, tal como se pidió) — los botones
  de WhatsApp existentes siguen siendo manuales/preparados, no
  automatizados.

---

## 9. Reportes

- `obtenerDashboardAdmin` excluye explícitamente `CANCELADO` de
  "finalizados" — un pedido cancelado **nunca** se cuenta en "Total
  ventas". Confirmado correcto leyendo el código, no solo asumido.
- El panel de reportes sí distingue los tres orígenes de pedido
  (`PUBLICO`/`ADMIN_DIRECTO`/`PERSONALIZADO`) y permite filtrar por cada
  uno.
- **Matiz a documentar, no bug**: una venta directa "fiada" queda
  `ENTREGADO`/`SIN_PAGO` y sí se cuenta en "Total ventas" aunque el dinero
  no se haya cobrado — el panel mitiga esto con una tarjeta separada de
  "Fiado pendiente" calculada desde la tabla `pagos` real, pero el rótulo
  "Ventas" no aclara explícitamente que no es lo mismo que "cobrado". Bajo
  / dato comercial (aclarar el rótulo en una fase futura).

---

## 10. Costos

- No existe ningún campo, flag ni indicador de UI que distinga un costo
  real facturado por proveedor de un costo por defecto o estimado.
  `costo_unitario` es un único número sin metadata de procedencia en toda
  la base de código (`domain/Producto.ts`, `supabase/schema.sql`, el
  importador CSV).
- El importador solo bloquea costo ≤0 o no numérico — no detecta valores
  repetidos/redondos sospechosos entre productos no relacionados.
- Esto conecta directamente con el hallazgo de datos (§3): 55000 se repite
  en 19 productos distintos, 50000 en 10, etc. — un patrón típico de
  costo default/estimado, no de facturación real producto por producto.
- **Conclusión: cualquier cálculo de utilidad hoy es tan confiable como el
  dato de costo subyacente, sin ninguna señal del sistema que alerte
  cuándo ese dato es un placeholder.** Severidad: **dato comercial
  pendiente / medio** — no es un bug de código, requiere que el negocio
  audite y idealmente marque el origen de los costos antes de confiar en
  reportes de utilidad.

---

## 11. Stock y reservas

Modelo confirmado uniforme en las 5 RPC/funciones que tocan stock
(`create_perfume_order_v1`, `create_direct_sale_v1`,
`mark_perfume_order_paid_v1`, `cancel_perfume_order_v1`,
`advance_perfume_order_status_v1`): `stock_actual` = físico,
`stock_reservado` = comprometido por pedidos públicos sin pagar,
disponible = `stock_actual - stock_reservado` en todas partes donde se
valida. Todas bloquean filas en orden determinista por `id` para evitar
deadlocks entre transacciones concurrentes. **Sin hallazgos** — semántica
correcta y consistente en toda la base.

---

## 12. Mobile UX

- Tarjetas de producto: adaptación real a 390px confirmada por las clases
  usadas (iconos/paddings reducidos en modo Top 12, sin overflow evidente).
- **Objetivos táctiles bajo 44px** en varios controles de uso frecuente:
  botones +/- de cantidad (32-40px según componente) y botón "Quitar" en
  varias tarjetas — no cumplen el mínimo recomendado, acumulativo porque
  son los controles que más se tocan repetidamente. Medio.
- Selector de tamaño/presentación sí cumple 44px en todos los lugares
  revisados.
- Botón flotante mobile puede confirmar el pedido sin pasar por el
  resumen completo (ver §4).
- Color café/ámbar sin migrar en el toast de éxito y en
  `WhatsAppFloatingButton` (no usado en público, pero presente en admin) —
  no coincide con la paleta violeta del resto del rediseño. Parece un
  remanente de la paleta anterior. Medio, bug visual real.
- Accesibilidad de formulario: región/comuna con `aria-invalid`/
  `aria-describedby` correctos; los demás campos de texto (nombre, RUT,
  teléfono, dirección) no tienen esos atributos pese a mostrar el mismo
  patrón de error — inconsistencia entre campos del mismo formulario.
  Bajo-medio.

---

## 13. Seguridad

*(Findings del agente de seguridad; alcance: revisión de código estático,
sin pruebas destructivas ni pentest activo contra el proyecto real.)*

### Fortalezas confirmadas

- Todas las rutas admin exigen autenticación + origen confiable.
  Ninguna página `/admin/*` quedó sin protección (se verificó cada
  `page.tsx`/`layout.tsx`).
- RLS/grants correctos en todas las tablas: `anon`/`authenticated` sin
  privilegio de escritura en ningún lado; todas las funciones
  transaccionales son `SECURITY DEFINER` con `revoke`/`grant` explícito
  solo a `service_role`.
- Storage (`product-images`): público de lectura, escritura acotada a
  `service_role` — único bucket en uso, sin otros recursos sensibles en
  Storage.
- Rutas públicas nunca confían en precio/total/stock del navegador —
  confirmado con un test explícito que inyecta valores maliciosos.
- Sin secretos hardcodeados, `.env` correctamente ignorado por git,
  `.env.example` sin valores reales.
- Subida de imágenes (Fase 3B.3): validación de tamaño, MIME declarado y
  decodificación real (magic bytes efectivos vía `sharp`) confirmada
  intacta.

### Hallazgos

- **CSP con `unsafe-inline` y `unsafe-eval` sin condicionar por entorno.**
  En una app con flujo de transferencia bancaria y datos personales de
  clientes en el panel admin, esto anula buena parte del valor de la CSP
  como mitigación de XSS. `connect-src` con comodín `https:` también es
  muy permisivo. No se encontró justificación documentada de por qué se
  necesita `unsafe-eval`. Severidad: **alto**.
- **Dependencias con vulnerabilidades altas en rutas de código
  activamente ejercitadas**: `next@16.2.9` (fix disponible en 16.2.12,
  sin romper compatibilidad), `sharp@0.34.5` (usado en el pipeline de
  imágenes que decodifica archivos subidos por el admin). Severidad:
  **alto**, esfuerzo de arreglo bajo para `next`.
- **Rate limiting solo en `/api/orders`, en memoria de un solo proceso**
  — no persiste entre instancias serverless, fácilmente evadible bajo
  carga real distribuida; el login admin (Supabase Auth directo) no tiene
  protección propia de la app. Medio.
- **Middleware no hace cumplir la autenticación de `/admin/*` por sí
  mismo** — solo refresca la sesión; la protección real depende 100% de
  que cada página individual repita el chequeo (hoy lo hacen todas, pero
  es un único punto de fallo arquitectónico para el futuro). Medio.
- Whitelist de campos inconsistente: `admin/products` (POST/PATCH) no
  rechaza campos desconocidos como sí lo hacen `direct-sales`,
  `orders/[pedidoId]` y `settings/payment` — mitigado hoy porque el
  servicio extrae campos uno a uno (no hay `insert(body)` crudo), pero es
  un patrón fresco a error si se agrega una columna sensible sin replicar
  la extracción explícita. Medio.
- Policies RLS "muertas": varias policies de lectura (`productos`,
  `clientes`, etc.) para `authenticated` son hoy inalcanzables porque el
  grant de tabla base fue revocado — funciona (todo pasa por
  `service_role` vía API), pero deja políticas que no hacen nada,
  riesgo de falsa sensación de seguridad si algún día se agrega el grant
  sin revisar que la policy sigue siendo semánticamente correcta. Bajo.

---

## 14. Deuda técnica

- ~600 líneas de vista legacy de creación/edición de producto en
  `AdminDashboard.tsx`, hoy inalcanzable por una redirección — o se
  restaura el acceso, o se elimina (§5).
- Navegación admin fragmentada en 4 shells sin patrón único (§5).
- Dos patrones de diálogo de confirmación conviviendo en el admin (§5).
- `components/shared/ProductCatalog.tsx` sin importadores activos (§4).
- Sin trazabilidad de origen de costo en el modelo de datos (§10).
- Garantías de idempotencia de pago/venta directa probadas contra mock en
  memoria y QA manual, no contra un test SQL automatizado sobre Postgres
  real (§9, §13/§10 de la auditoría de seguridad) — a diferencia de la
  garantía de cancelación, que sí tiene esa cobertura.
- Documentación fragmentada entre dos eras del proyecto (§15).

---

## 15. Documentación

Todo el set de documentos numerados `00_INDICE_DOCUMENTACION.md` a
`43_ESTADO_ACTUAL_APP_2026_06_26.md` (44 archivos) es **explícitamente**
documentación de "Pauli Store", el negocio anterior al rebrand — el
propio índice dice "Guiar el desarrollo de Pauli Store". El último
snapshot de estado consolidado (`43_...`) es del 2026-06-26, más de un
mes antes de esta auditoría, y ya en ese momento seguía titulado Pauli
Store. Desde entonces existen ~16 documentos nuevos
`SMELLME_*`/`PERFUME_STORE_*` que cubren temas puntuales (import de
catálogo, familias de producto, RLS, venta directa, configuración de
pago, subida de imágenes) pero **ningún documento consolidado responde
hoy "qué es Smellme.cl, en qué estado está, cuál es la arquitectura
vigente"** sin leer y filtrar mentalmente ~60 archivos de dos eras
distintas del proyecto.

Severidad: **alto** (deuda de documentación real — no bloquea
funcionalidad, pero sí a cualquier persona nueva que se sume al proyecto,
incluido un futuro asistente de IA sin este contexto de conversación).

Recomendación puntual: un único documento "Smellme.cl hoy" que reemplace
la necesidad de leer los 44 documentos de Pauli Store para entender el
sistema actual, dejando esos 44 archivados como referencia histórica.

---

## 16. Asistente futuro de imágenes de producto

Diseño completo en `docs/SMELLME_IMAGE_ASSISTANT_DESIGN.md` (documento
separado, creado en esta misma pasada). Resumen: dado que el 96% del
catálogo no tiene imagen (§3), un asistente semi-automático que busque
candidatos en dominios de fabricantes/distribuidores aprobados, los
puntúe por confianza, y deje la aprobación final a un humano (con
aprobación en lote solo para "alta confianza") — reutilizando el pipeline
de procesamiento ya construido en 3B.3 sin duplicar nada. Incluye diseño
explícito de protección SSRF (el riesgo nuevo más relevante, ya que hoy
nada en el código hace `fetch` a una URL elegida por un tercero), lista
blanca/exclusión de dominios, score explicable, historial/deduplicación,
límites y rollback. **No implementado, ni debía serlo en esta fase.**

---

## 17. Prioridades (qué resolver primero)

1. **Cargar datos bancarios reales** en `/admin/configuracion` — desbloquea
   todo el flujo de pedidos públicos. No requiere código.
2. **Corregir la fila fantasma de Top 12 rank #4** — reemplazar el vínculo
   por el producto real y completo. Requiere una corrección de datos
   puntual (fuera de alcance de esta auditoría de solo lectura).
3. **Restaurar o reconstruir el alta de producto nuevo** — tarea
   administrativa core, hoy inalcanzable.
4. **Resolver el duplicado "Libre" / decidir sobre "Yves Saint Lauren"
   vs. "Laurent"** — dato + posible normalización de marca.
5. Desde ahí, seguir el orden de fases de la sección 18.

---

## 18. Fases recomendadas

### Fase A — Bloqueos críticos y consistencia

**Objetivo:** desbloquear la operación real y corregir los 2 hallazgos
críticos de datos/UI.
**Incluye:** cargar `business_settings` real; corregir/re-vincular Top 12
rank #4; restaurar alta de producto nuevo (evaluar: reconstruir un
formulario simple en los paneles nuevos, vs. rescatar la vista legacy);
resolver duplicado "Libre".
**Archivos principales:** `components/admin/CatalogControlCenter.tsx` o
un nuevo panel de alta; datos de `productos`/`business_settings`
directamente (no vía migración).
**Migración:** no.
**Pruebas:** nuevas pruebas para el flujo de alta de producto restaurado.
**Riesgo:** bajo (correcciones acotadas, sin tocar transacciones).
**Dependencias:** ninguna.
**Esfuerzo relativo:** medio (la corrección de datos es rápida; el alta
de producto nuevo requiere diseño de UI, no solo un fix).

### Fase B — Tienda pública y UX cliente

**Objetivo:** reducir fricción de conversión y corregir bugs de UX
identificados.
**Incluye:** agregar canal de WhatsApp real al storefront público;
corregir el mensaje de error del catálogo; resolver la ambigüedad de
"Total" en el carrito; revisar la paginación de 5 ítems por defecto;
unificar targets táctiles a 44px; migrar el color café/ámbar residual.
**Archivos principales:** `components/OrderForm.tsx`,
`components/shared/CartSummary.tsx`, `components/shared/CatalogExplorer.tsx`,
`components/shared/ProductCard.tsx`, `components/shared/WhatsAppFloatingButton.tsx`.
**Migración:** no.
**Pruebas:** pruebas de UI/helpers existentes a extender; verificación
manual en 390/768/1440px (esta auditoría no la hizo).
**Riesgo:** bajo-medio (tocar el formulario de pedido público requiere
cuidado de no romper validaciones ya probadas).
**Dependencias:** ninguna.
**Esfuerzo relativo:** medio.

### Fase C — Notificaciones y operación administrativa

**Objetivo:** cerrar los gaps de navegación y notificaciones del panel.
**Incluye:** deep-link real de push al pedido específico; manejo de
sesión expirada en mutaciones in-page; unificar navegación admin en un
shell único; filtro de fecha/origen en la vista de Pedidos; unificar
patrón de confirmación (usar `useAppFeedback` en todos los paneles).
**Archivos principales:** `public/admin-sw.js`, `lib/pwa/sendWebPush.ts`,
`components/admin/AdminDashboard.tsx`, `components/admin/catalog-center/AdminCatalogShell.tsx`.
**Migración:** no (a menos que se decida agregar log de errores de push,
que sí requeriría una tabla nueva).
**Pruebas:** nuevas pruebas para el deep-link y el manejo de 401.
**Riesgo:** medio (tocar la navegación global toca muchas pantallas).
**Dependencias:** ninguna, pero conviene hacerla después de la Fase A
para no navegar sobre datos rotos.
**Esfuerzo relativo:** alto (la unificación de navegación es la pieza más
grande).

### Fase D — Reportes y conciliación

**Objetivo:** cerrar el gap de prueba real contra Postgres y aclarar
"vendido" vs. "cobrado".
**Incluye:** agregar a `supabase/tests/perfume_store_transactional_stock.sql`
los escenarios de doble `mark_perfume_order_paid_v1` y de idempotencia de
`create_direct_sale_v1` contra Postgres real; aclarar el rótulo de
"Ventas" vs. "Cobrado" en el dashboard; evaluar agregar
`costo_origen`/`costo_verificado` para trazabilidad de costos.
**Archivos principales:** `supabase/tests/perfume_store_transactional_stock.sql`,
`components/admin/AdminDashboard.tsx`, potencialmente una migración nueva
para la columna de procedencia de costo.
**Migración:** sí, solo si se decide agregar la columna de procedencia de
costo.
**Pruebas:** las nuevas pruebas SQL son el entregable principal de esta
fase.
**Riesgo:** bajo (son pruebas y aclaraciones de texto, no cambios de
lógica transaccional).
**Dependencias:** ninguna.
**Esfuerzo relativo:** bajo-medio.

### Fase E — QA integral, seguridad y producción

**Objetivo:** cerrar los gaps de seguridad defensiva antes de un
lanzamiento real y hacer la verificación manual pendiente.
**Incluye:** actualizar `next` (16.2.9 → 16.2.12+) y evaluar actualizar
`sharp`; condicionar CSP (`unsafe-inline`/`unsafe-eval`) por entorno o
investigar si realmente se necesitan; agregar rate limiting distribuido
(o al menos documentar la limitación actual); mover la autenticación de
`/admin/*` al middleware como defensa en profundidad; unificar whitelist
de campos en `admin/products`; QA manual real en 390/768/1440px del
storefront público (pendiente de esta auditoría, que fue solo de código).
**Archivos principales:** `next.config.ts`, `package.json`,
`app/proxy.ts` (middleware), `app/api/admin/products/route.ts` y
`[productId]/route.ts`.
**Migración:** no.
**Pruebas:** pruebas de seguridad existentes a extender; QA manual
documentado.
**Riesgo:** medio (actualizar `next` puede requerir ajustes menores;
tocar CSP requiere probar que nada se rompe).
**Dependencias:** conviene hacerla después de A-D para no mezclar
correcciones de seguridad con correcciones funcionales en el mismo
período de prueba.
**Esfuerzo relativo:** medio-alto.

### Fase F — Asistente automático de imágenes

**Objetivo:** implementar el diseño de
`docs/SMELLME_IMAGE_ASSISTANT_DESIGN.md`.
**Incluye:** los 15 pasos del proceso documentado, empezando por el
catálogo de dominios aprobados y las protecciones SSRF antes que
cualquier lógica de búsqueda.
**Archivos principales:** nuevos, a definir en la fase de implementación
(el diseño ya sugiere una tabla de historial/cola y un catálogo de
dominios).
**Migración:** sí (tabla de historial/cola de candidatos, catálogo de
dominios).
**Pruebas:** normalización/matching, score, guardas SSRF, deduplicación —
todas listadas en el diseño.
**Riesgo:** medio-alto (es la única fase que introduce un vector nuevo,
`fetch` a URLs de terceros — de ahí la insistencia en SSRF antes que
cualquier otra cosa).
**Dependencias:** el pipeline de procesamiento de 3B.3 (ya existe, no
depende de ninguna fase A-E, pero tiene sentido hacerla al final por ser
la de mayor esfuerzo y menor urgencia respecto a los bloqueos reales de
producción).
**Esfuerzo relativo:** alto.

---

## 19. Riesgos

- **Riesgo de negocio inmediato**: sin datos bancarios cargados, el
  sistema no puede procesar un solo pedido público de punta a punta hoy.
  Es el riesgo más alto y el de solución más simple (es un dato, no
  código).
- **Riesgo de confianza en reportes**: hasta que se resuelva la
  trazabilidad de costos (§10), cualquier decisión de negocio basada en
  "utilidad" reportada por el sistema debe tratarse con escepticismo.
- **Riesgo de seguridad diferido**: los CVEs de `next`/`sharp` y la CSP
  debilitada no son explotación activa conocida, pero son superficie real
  en rutas ejercitadas — conviene resolverlos antes de tráfico público
  real, no después.
- **Riesgo de mantenimiento**: la navegación admin fragmentada y los ~600
  líneas de código muerto en `AdminDashboard.tsx` aumentan el costo de
  cualquier cambio futuro en esa pantalla.
- **Riesgo de escala baja pero real**: el rate limiting en memoria de un
  solo proceso deja de proteger si el tráfico crece lo suficiente para
  correr en múltiples instancias serverless simultáneas.

---

## 20. Criterio para producción

No se recomienda desplegar a producción con tráfico real hasta cerrar,
como mínimo, la **Fase A completa** (datos bancarios reales, Top 12
corregido, alta de producto restaurada) — sin esto, el sistema no puede
completar su función más básica (vender y cobrar un perfume) de punta a
punta. La Fase B (WhatsApp público, mensaje de error) es fuertemente
recomendada antes de anunciar la tienda públicamente, aunque técnicamente
no bloquea una venta. Las Fases C-E pueden abordarse en paralelo con una
operación ya iniciada a baja escala, priorizando E (seguridad) antes de
cualquier campaña de tráfico significativa. La Fase F (asistente de
imágenes) es la única sin urgencia de producción — el catálogo puede
venderse hoy con placeholders de imagen (ya bien resueltos visualmente,
`components/ProductImage.tsx`) mientras se cargan fotos manualmente o se
construye el asistente con calma.

**No se desplegó producción, no se mergeó `main`, no se creó ningún tag,
y no se modificó ningún producto/precio/stock/posición de Top 12 real
durante esta auditoría** — todos los hallazgos de datos vienen de
consultas `SELECT` de solo lectura.

## 21. Cierre documental y conjunto protegido para la fase siguiente

La revisión administrativa identificó un conjunto cercano a 28 filas con
alguna observación de identidad, duplicidad, completitud o estado. Esa cifra
es una referencia de conciliación, no un objetivo que deba forzarse: la fase
de implementación debe reconstruir el conjunto desde el catálogo remoto, el
motor de calidad y el CSV del proveedor, y detener cualquier lote real si la
diferencia supera cinco productos.

Todas esas filas quedan protegidas contra cambios automáticos de imagen. La
misma protección aplica a duplicados exactos o posibles, nombres o marcas
inconsistentes, contenido o concentración dudosos, variantes ambiguas,
testers/sets/packs/miniaturas, productos pausados o `ZZTEST-*`, productos con
imagen y cualquier fila marcada para auditoría. La lista detallada y el
criterio de puntuación están cerrados en
`docs/SMELLME_IMAGE_ASSISTANT_DESIGN.md`.

La configuración bancaria se audita únicamente por completitud de sus seis
categorías. Este informe no conserva ni debe conservar banco, tipo o número
de cuenta, titular, RUT ni correo reales. Al momento de esta lectura estaba
incompleta; debe verificarse nuevamente, sin seleccionar ni imprimir valores,
justo antes del QA de cobro.
