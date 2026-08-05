# Banlist de clientes — diseño (Fase 7.5A)

Rama: `feature/customer-banlist`. Implementación local únicamente: **la
migración descrita aquí no fue aplicada en Supabase remoto** — ver
sección "Migración preparada, no aplicada".

## Alcance

Bloquear/desbloquear un cliente desde `/admin/clientes`, con motivo interno
obligatorio, historial conservado, y rechazo server-side de nuevos pedidos
públicos de un cliente bloqueado (por RUT, teléfono o correo exactos). Sin
tocar Top 15, Ofertas, cierres semanales, stock, costos, fórmula de precios,
importador, Auth, RLS ni CSP.

## Modelo elegido: ampliar `public.clientes` (aditivo)

Columnas nuevas en la tabla existente `clientes`:

```
bloqueado        boolean     not null default false
motivo_bloqueo   text        null
bloqueado_en     timestamptz null
desbloqueado_en  timestamptz null
bloqueado_por    text        null
```

`bloqueado_por` almacena `admin.userId` (el `user.id` de Supabase Auth
resuelto por `getAuthenticatedAdmin()` en `lib/admin-auth.ts`, ya validado
contra `usuarios_admin`) — es el único identificador de administrador
estable y ya existente en el proyecto. No se guarda correo ni nombre como
clave, y no se inventa una entidad de "administrador" nueva. No se
almacenan tokens ni secretos.

Ningún cliente existente queda bloqueado: el `default false` cubre la
migración completa de la tabla actual sin tocar una sola fila.

### Alternativa descartada: tabla `clientes_banlist` separada

Se evaluó una tabla independiente (`clientes_banlist` con `cliente_id`,
`motivo`, `bloqueado_en`, etc.) y se descartó porque:

- la identidad de un cliente (teléfono → RUT → correo, en ese orden de
  confianza) ya vive centralizada en `repositories/clienteRepository.ts`
  (`matchesCustomerIdentity`) y en la función SQL `create_perfume_order_v1`
  (`supabase/migrations/20260726000000_..._no_temp_tables.sql:186-217`) —
  una tabla separada obligaría a duplicar esa misma lógica de matching en un
  tercer lugar, o a hacer un `JOIN` extra en cada verificación y en cada
  listado administrativo;
- bloquear es un atributo del ciclo de vida del cliente mismo (como
  `activo` lo es para un producto), no una entidad con su propio ciclo de
  vida independiente;
- no se demostró ningún caso en que ampliar `clientes` impida reconocer
  correctamente un nuevo intento por teléfono/RUT/correo — el cliente
  bloqueado sigue siendo la misma fila con los mismos identificadores.

Por eso se ampira la tabla existente, siguiendo el mismo patrón ya usado
para `es_top`/`orden_destacado` en `productos` (Fase 7.2/7.4).

## Identificadores y normalización (reutilizados, no duplicados)

Prioridad de coincidencia: **teléfono → RUT → correo** (nunca el nombre).
Se reutilizan los helpers existentes, sin duplicar algoritmos:

- Teléfono: `parseChileanMobilePhone` (`lib/chile-phone.ts`) para validar y
  obtener `.e164`; `normalizeCustomerPhoneKey` (`lib/customers/identity.ts`)
  para comparar valores ya almacenados con distinto formato.
- RUT: `parseChileanRut` (`lib/rut.ts`) valida dígito verificador y produce
  `.normalized`; `normalizeCustomerRutKey` para comparación.
- Correo: `isValidEmail`/`normalizeEmail` (`lib/validators.ts`).

La comprobación de bloqueo usa **igualdad exacta** sobre los valores
normalizados almacenados en `clientes.telefono`/`clientes.rut`/
`clientes.email` — nunca `includes`, `startsWith` ni comparación difusa.

**Riesgo documentado**: un teléfono o correo compartido entre dos personas
distintas (ej. un número familiar, un correo de pareja) bloquearía a ambas
por igual, porque el sistema no tiene forma de distinguir personas más allá
de esos tres identificadores. Esto es una limitación aceptada del modelo
actual (la misma limitación que ya existe para la deduplicación general de
clientes), no algo que esta fase introduce nuevo.

## Punto de aplicación del bloqueo en el pedido público

`POST /api/orders` → `PedidoService.crearPedido` → (única llamada)
`pedidoRepository.crearPedidoTransaccional` → RPC `create_perfume_order_v1`.

La auditoría confirmó que **no existe ninguna escritura en base de datos
antes de esa llamada a la RPC** en el flujo actual — el cliente se
resuelve/crea *dentro* de la función SQL (teléfono → RUT → correo), no en
TypeScript.

Por eso se implementa la comprobación **antes de invocar la RPC**, en
`PedidoService.crearPedido`, justo después de normalizar teléfono/RUT/correo
y antes de la única escritura real:

```ts
const bloqueado = await this.clienteRepository.buscarClienteBloqueadoPorIdentidad({
  telefono: normalizedPhone.e164,
  rut: normalizedRut.normalized,
  email: input.email.trim().toLowerCase()
});
if (bloqueado) {
  throw new CustomerBlockedError();
}
```

Si hay coincidencia: no se llama a la RPC, no se crea pedido, no se reserva
stock, no se crea ni modifica cliente, no se genera venta ni pago, y no
queda ningún estado parcial (la función nunca se invoca).

### Atomicidad: ventana de carrera residual (no resuelta en esta fase)

`create_perfume_order_v1` **no se modificó** — sigue intacta. La
comprobación en TypeScript y la resolución/creación de cliente dentro de la
RPC son dos pasos separados, no una transacción única. Existe una ventana
de carrera teórica: si un administrador bloquea a un cliente en el
milisegundo exacto entre la lectura de `buscarClienteBloqueadoPorIdentidad`
y la ejecución de la RPC, ese pedido específico podría completarse. Esto
sigue el mismo criterio que
`docs/SMELLME_OFFERS_ATOMICITY_PROPOSAL.md`: es un riesgo real pero de
probabilidad extremadamente baja (requiere que un admin bloquee al mismo
cliente que está completando un pedido en ese instante exacto), sin impacto
en stock/pagos/seguridad más allá de permitir un pedido aislado que se
puede cancelar manualmente después. **No se creó ninguna función SQL, RPC,
trigger ni constraint para cerrar esta ventana en esta fase** — sería la
alternativa más robusta (verificar el bloqueo dentro de la misma
transacción que resuelve `v_cliente_id`), pero está fuera del alcance
autorizado de la Fase 7.5A. Queda documentado como pendiente para una fase
posterior si se decide cerrarlo con una migración a `create_perfume_order_v1`.

### Código interno y mensaje público

Código interno: `CUSTOMER_BLOCKED` (propiedad `.code` en el error lanzado,
nunca parte del mensaje mostrado al usuario).

Mensaje público (idéntico en todos los casos, sin importar cuál
identificador coincidió):

> "No pudimos procesar tu pedido en este momento. Comunícate con nosotros
> por WhatsApp para recibir ayuda."

Nunca se revela públicamente: que existe una banlist, el motivo del
bloqueo, cuál identificador coincidió, ni qué administrador bloqueó al
cliente.

## Privacidad y datos administrativos

`motivo_bloqueo`, `bloqueado_en`, `desbloqueado_en` y `bloqueado_por` son
exclusivamente administrativos:

- nunca se incluyen en `/api/products`, `/api/orders` (respuesta pública),
  el catálogo, el carrito, la confirmación de pedido ni el mensaje de
  WhatsApp del cliente;
- solo se exponen en `/api/admin/customers` y
  `/api/admin/customers/[customerId]`, ambos detrás de
  `isAdminAuthenticated()`;
- a nivel de base de datos quedan protegidos exactamente igual que el resto
  de la tabla `clientes`: `anon` y `authenticated` no tienen ningún GRANT
  sobre la tabla (confirmado en
  `supabase/migrations/20260728010000_runtime_table_privileges.sql:82-89`),
  solo `service_role` puede leer/escribir, y la aplicación siempre se
  conecta con la clave de servicio. No se agregó ningún GRANT nuevo porque
  los existentes ya cubren las columnas nuevas.

## Historial conservado

Bloquear o desbloquear nunca borra al cliente, sus pedidos, ventas, pagos ni
fiado. `bloqueado` es la única fuente de verdad sobre el estado actual;
`bloqueado_en` conserva la fecha del último bloqueo aunque el cliente se
desbloquee después; `motivo_bloqueo` se conserva como referencia
administrativa tras el desbloqueo (no se borra) para que quede visible por
qué se bloqueó anteriormente si se reincide.

## Migración preparada, no aplicada

Archivo: `supabase/migrations/20260807000000_smellme_customer_banlist.sql`.

- Solo `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (aditivo), un índice
  parcial (`where bloqueado = true`) y un `CHECK` de longitud sobre
  `motivo_bloqueo`.
- Sin `INSERT`, `UPDATE`, `DELETE`, `DROP` ni `TRUNCATE`.
- Sin nuevos `GRANT`/`REVOKE` (los existentes ya cubren las columnas
  nuevas del mismo modo que cubren el resto de `clientes`).
- **No se ejecutó** `supabase db push` ni SQL alguno contra Supabase
  remoto. El esquema remoto permanece exactamente como estaba antes de esta
  fase.

## Despliegue pendiente — Fase 7.5B

- Revisión final de la migración.
- Aplicación controlada de la migración en Supabase remoto.
- Preview de Vercel con QA autenticado real (bloquear/desbloquear un
  cliente de prueba, verificar rechazo de pedido).
- Merge a `main` y despliegue productivo.

## Fuera de alcance de esta fase

- Resolver la ventana de carrera de atomicidad (documentada arriba).
- Cualquier cambio a Top 15, Ofertas de la semana (su riesgo de atomicidad
  documentado en `docs/SMELLME_OFFERS_ATOMICITY_PROPOSAL.md` se conserva
  intacto y sin resolver, a propósito).
- Cierres semanales administrativos (Fase 7.6).
- Venta directa, pedidos personalizados, cobranza y reportes: pueden llegar
  a mostrar un badge de "Bloqueado" si ya listan al cliente, pero sus
  contratos no se modifican en esta fase — la restricción obligatoria
  aplica únicamente al pedido público.
