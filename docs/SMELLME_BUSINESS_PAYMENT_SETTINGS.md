# Smellme.cl — Configuración privada de transferencias

## Almacenamiento

Los datos viven en la fila singleton de `public.business_settings`, cuyo
identificador fijo es:

```text
00000000-0000-0000-0000-000000000001
```

Se utilizan únicamente `banco`, `tipo_cuenta`, `numero_cuenta`,
`titular_cuenta`, `rut_titular` y `correo`. Las columnas y la fila ya
existían; no fue necesaria una migración de estructura ni de datos.

Producción usa `BusinessSettingsRepository` con Supabase. El repositorio
ejecuta un `SELECT` explícito, un `UPDATE` explícito y filtra siempre por el
UUID singleton constante. No acepta un identificador del cliente y no usa
`SELECT *`, `INSERT`, `UPSERT` o `DELETE`. La implementación en memoria sólo
es compatibilidad de desarrollo/pruebas cuando Supabase no está configurado.

## Migración de privilegios

`20260731000000_grant_service_role_payment_settings_columns.sql` es una
migración exclusivamente de permisos. Retira acceso de `anon` y
`authenticated`, retira de `service_role` los privilegios heredados
`TRUNCATE`/`REFERENCES`/`TRIGGER`, y concede:

- `SELECT`: `id` y las seis columnas del flujo;
- `UPDATE`: sólo las seis columnas del flujo.

No concede `INSERT`, `DELETE` ni acceso a otras columnas. RLS permanece
activa y no existe política pública. La migración fue aplicada al proyecto
remoto `perfume-store`; su historial quedó alineado en
`20260731000000`.

## Pantalla y API

La pantalla autenticada es `/admin/configuracion`. Presenta Datos de
transferencia, Datos de contacto, Despacho, Notificaciones y Seguridad;
sólo Transferencia se implementa en esta fase. Seguridad mantiene acceso al
cambio de contraseña y cierre de sesión.

La API autenticada es:

- `GET /api/admin/settings/payment`: devuelve la forma editable sin caché;
- `GET /api/admin/settings/payment?summary=1`: devuelve sólo `{ completa }`;
- `PUT /api/admin/settings/payment`: valida y guarda la lista blanca.

El `PUT` exige sesión, origen confiable, `Content-Type` JSON, objeto JSON
válido y ausencia de claves desconocidas. No registra números de cuenta en
logs.

## Catálogos y opción Otro

`config/chileanBanks.ts` y `config/chileanAccountTypes.ts` contienen valores
estables y únicos. `OTRO_BANCO` y `OTRA` están al final. Para un valor libre
se almacena el nombre introducido en la columna de texto existente; al
editarlo se reconstruye automáticamente la opción Otro.

Para actualizar el catálogo se agrega una entrada con un `value` nuevo y
estable. Una etiqueta comercial puede corregirse sin cambiar su `value`.
No se deben reutilizar values retirados.

## Validación y privacidad

Cliente y servidor validan:

- banco y tipo pertenecientes al catálogo;
- descripción obligatoria para Otro;
- titular y número de cuenta no vacíos;
- RUT chileno válido;
- correo válido y normalizado a minúsculas;
- límites de longitud.

El número de cuenta siempre es `string`, por lo que conserva ceros
iniciales. La moneda es fija: Pesos chilenos (CLP). Fuera de la pantalla de
edición sólo se usa el estado completo/incompleto; la vista previa enmascara
el número y las APIs públicas no reciben datos bancarios.

## Uso en pedidos

- Atender valida la configuración antes de mutar `NUEVO -> AGENDADO`.
- Reenviar recarga configuración y pedido sin mutarlos.
- Confirmar conserva la RPC atómica de pago/stock.
- Coordinar entrega sólo reconstruye el mensaje.
- Cancelar conserva la RPC e idempotencia existentes.

No se incluyen cuentas reales en código, pruebas ni documentación.
