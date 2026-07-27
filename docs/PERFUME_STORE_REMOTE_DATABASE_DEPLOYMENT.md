# Despliegue remoto de la base de datos — Fase 1D-A

- Fecha de despliegue: 2026-07-26
- Rama: `feature/perfume-store-foundation`
- Commit base: `500b443b0bf2621deed007b8b192432557708fbc` (`fix(db): remove temp tables from order RPC`)
- Fase anterior: Fase 1C (stock transaccional), documento [`PERFUME_STORE_TRANSACTIONAL_STOCK.md`](PERFUME_STORE_TRANSACTIONAL_STOCK.md)
- Alcance de esta fase: vinculación y despliegue controlado de las migraciones canónicas de Perfume Store contra el Supabase remoto nuevo, validación post-despliegue (`migration list`, `db lint`, smoke test SQL), y este documento. **No se tocó Vercel, `.env`, `package-lock.json`, `public/`, imágenes, branding ni CSV. No se creó administrador ni se importaron productos.**

## 1. Objetivo

Aplicar de forma segura, únicamente desde un workspace temporal fuera del repositorio, las migraciones canónicas de Perfume Store al proyecto Supabase remoto nuevo (hasta ese momento vacío), y validar que el esquema, las RPC, los permisos y el comportamiento transaccional se sostienen fuera del entorno local.

## 2. Project Ref (sanitizado)

```
nxgkudvrotlaqvvhygem
```

Proyecto: `perfume-store` (organización propia, región `us-west-2`). No se muestra contraseña, connection string completa, access token ni service role key en ningún momento de esta fase ni en este documento.

## 3. Migraciones aplicadas (en orden)

| # | Migración | SHA-256 |
|---|---|---|
| 1 | `20260724000000_perfume_store_foundation.sql` | `1888966e38be769493d9c34eb9a678b6750d19ab12a7ca558383f902d6e09d4e` |
| 2 | `20260724010000_perfume_store_transactional_stock.sql` | `e55e6e7d2a2956736758e720dee37a4f834c0cc64b0134f69312bd779433a4b0` |
| 3 | `20260726000000_perfume_store_create_order_no_temp_tables.sql` | `2104ea13bdbc69821c31f122ef28a1c2e9498f42217d8183ec01b94c315bb7b6` |

Ninguna migración heredada de Pauli Store se ejecutó contra el remoto. Los hashes se calcularon sobre los archivos del repositorio y se verificaron idénticos contra las copias usadas en el workspace temporal antes de cada `db push`.

## 4. Resultado de `migration list --linked`

```json
{"migrations":[
  {"local":"20260724000000","remote":"20260724000000"},
  {"local":"20260724010000","remote":"20260724010000"},
  {"local":"20260726000000","remote":"20260726000000"}
]}
```

Local y remoto alineados en las tres migraciones.

## 5. Resultado de `db lint --linked --fail-on error`

**Código de salida 0.**

```
Linting schema: extensions
Linting schema: public

No schema errors found
```

Este resultado se obtuvo únicamente después de aplicar la migración 3 (ver sección 8): antes de esa migración, el lint remoto marcaba un error real de análisis estático sobre `create_perfume_order_v1` (documentado en detalle en `PERFUME_STORE_TRANSACTIONAL_STOCK.md`, sección 24).

## 6. Warning conocido de `pg-delta`/certificado durante `db push`

Al ejecutar `supabase db push --linked` (tanto para las migraciones 1-2 como para la migración 3), la CLI mostró un warning no fatal de un subsistema interno:

```
Warning: failed to cache migrations catalog: error exporting pg-delta catalog: edge-runtime script produced no output:
runtime has escaped from the event loop unexpectedly: ... Failed to read certificate file '/workspace/supabase/.temp/pgdelta/pgdelta-target-ca.crt': ENOENT ...
```

**Por qué no afectó la aplicación de las migraciones**: este warning ocurre en un worker interno (`pg-delta`/edge-runtime) que intenta cachear un catálogo de migraciones para funciones internas de diff/lint de la propia CLI — no es la ejecución del SQL de la migración. En ambas ocasiones, `supabase migration list --linked` ejecutado inmediatamente después confirmó que la migración correspondiente quedó aplicada (`remote` igual a `local`), y el mensaje final de la CLI fue `Finished supabase db push.` sin abortar. Se verificó explícitamente antes de continuar, tal como exige el protocolo de esta fase, en vez de asumir éxito.

## 7. Intento de pgTAP remoto y restricción del esquema `extensions`

Se intentó validar el remoto con una suite pgTAP (`supabase test db --linked`), creada únicamente dentro del workspace temporal. El intento quedó bloqueado por una restricción de plataforma, no de las migraciones ni del script:

```
ERROR: permission denied for schema extensions
```

El esquema `extensions` (donde vive la extensión `pgtap` en este proyecto) pertenece a un rol interno de la plataforma Supabase Cloud, no al rol de conexión que aplicó las migraciones. Ese rol de conexión no tiene autoridad para otorgarse a sí mismo ni a `service_role` acceso (`GRANT USAGE ON SCHEMA extensions`) sobre ese esquema. No existe ningún `GRANT` ejecutable desde la sesión de la CLI que resuelva esto: es una limitación del proyecto, no un defecto corregible en el código de la aplicación.

**Decisión**: abandonar pgTAP para este proyecto y reescribir la misma cobertura de verificación como SQL/PL/pgSQL plano (sección 8), sin depender de ninguna extensión de terceros.

## 8. Suite SQL plana equivalente (decisión y ejecución)

Se adaptó la lógica ya validada en `supabase/tests/perfume_store_transactional_stock.sql` (Fase 1C, local) a un script SQL plano sin tablas temporales para paso de estado entre statements (se usó `set_config()`/`current_setting()`, ya que una tabla temporal creada por el rol de conexión por defecto no es accesible para `service_role` tras un `set role` — mismo tipo de restricción de permisos que con `extensions`). El script:

- vive únicamente en el workspace temporal, nunca se copió al repositorio;
- corre dentro de una única transacción `BEGIN; ... ROLLBACK;`;
- usa `set role service_role` puntualmente para las llamadas a las RPC (que solo `service_role` puede ejecutar) y vuelve al rol de conexión por defecto (dueño de las tablas) para las lecturas de verificación directas;
- usa `set role anon` / `set role authenticated` para confirmar que esos roles no pueden ejecutar las RPC operativas;
- se ejecutó con `supabase db query --linked --file <archivo>`.

Durante la construcción de esta suite se encontraron y corrigieron tres errores propios del script de prueba (no de las migraciones ni de las RPC): una variable declarada `jsonb` para un resultado que en realidad es `text` (causaba `invalid input syntax for type json`), dos verificaciones que leían tablas directamente mientras se impersonaba `service_role` (movidas a después de volver al rol por defecto), y una aserción de stock que repetía el mismo error de cálculo ya corregido en el smoke test local de Fase 1C (no contaba la reserva pendiente de un pedido con líneas duplicadas que el propio script deja sin pagar ni cancelar). Ninguna corrección tocó las migraciones ni el código de la aplicación.

### Resultado: 18 escenarios verificados, código de salida 0

1. Configuración genérica de despacho (`costo_despacho_semanal = 4000`).
2. `business_settings` sin datos bancarios, RUT ni teléfono reales.
3. `service_role` puede ejecutar `next_perfume_order_code`.
4. Productos genéricos de prueba creados (ficticios, marca "Marca Remota").
5. Pedido Starken: despacho 0, subtotal desde catálogo real, `stock_reservado` incrementado sin tocar `stock_actual`.
6. Pedido domicilio semanal: despacho 4000 sumado una sola vez.
7. Líneas duplicadas del mismo producto agregadas en una sola línea de `pedido_items`.
8. Producto inactivo rechazado (`PF003`).
9. Stock insuficiente rechazado (`PF005`).
10. Segundo pedido que compite por stock ya reservado, también rechazado (`PF005`).
11. Marcar pagado: reduce `stock_actual` y `stock_reservado`, dos estados en `PAGADO`, pago registrado.
12. Cancelar pedido no pagado: libera la reserva sin tocar `stock_actual`.
13. Segunda cancelación del mismo pedido rechazada (`PF011`), sin alterar stock de nuevo.
14. Cancelar pedido pagado sin confirmar, rechazado (`PF013`).
15. Cancelar pedido pagado confirmando: repone `stock_actual` una sola vez; repetir la cancelación no repone dos veces (`PF011`).
16. Transiciones `PAGADO → PREPARANDO → DESPACHADO → ENTREGADO` completas, con fechas registradas y sin alterar stock; transición inválida sobre `ENTREGADO` rechazada (`PF012`); cancelación de `ENTREGADO` por el flujo común rechazada (`PF012`).
17. Permisos: `anon` y `authenticated` no pueden ejecutar `create_perfume_order_v1` (`insufficient_privilege`); `service_role` sí puede.
18. Snapshot de producto conservado en `pedido_items`; formato (`PERF-YYYY-000001`) y unicidad del código de pedido confirmados.

**ROLLBACK final**: el script termina con `ROLLBACK;` explícito. Confirmado por separado, con una consulta de solo lectura independiente (`supabase db query --linked`), que no quedó ningún producto, cliente, pedido ni pago de prueba: `productos_prueba: 0, clientes_prueba: 0, pedidos_prueba: 0, pagos_prueba: 0`.

## 9. Ausencia de permisos nuevos persistentes

Se verificó contra `information_schema.role_table_grants` para `service_role` sobre las 7 tablas de la aplicación. Solo aparecen `REFERENCES`, `TRIGGER` y `TRUNCATE` — privilegios por defecto de la plantilla Supabase, preexistentes al despliegue de esta fase. Ningún `SELECT`/`INSERT`/`UPDATE`/`DELETE` quedó otorgado de forma permanente: la suite final no usó ningún `GRANT` (se resolvió con cambios de rol en vez de otorgar permisos nuevos).

## 10. Salto esperado del correlativo

Durante las distintas pruebas y reintentos de esta fase, `next_perfume_order_code()` se llamó varias veces (incluyendo intentos fallidos posteriormente revertidos). La secuencia `perfume_order_code_seq` avanzó en cada llamada — esto es intencional y no reversible por diseño en PostgreSQL (`nextval()` no participa de `ROLLBACK`, igual que si un pedido real fallara después de generar su código). **No se debe reiniciar la secuencia**: los saltos en la numeración no afectan la unicidad ni la seguridad de los códigos, y reiniciarla arriesgaría colisiones futuras.

## 11. Confirmaciones explícitas

- **No se creó administrador**: la tabla `usuarios_admin` sigue vacía en el proyecto remoto; esta fase no insertó ningún registro ahí.
- **No se importaron productos**: los únicos productos que tocaron el remoto fueron los genéricos de prueba de la suite SQL, creados y revertidos dentro de la misma transacción (`ROLLBACK`).
- **Vercel no fue configurado**: ninguna variable de entorno, dominio ni despliegue se tocó en esta fase.
- **Repositorio real intacto durante la validación remota**: todos los `GRANT`, cambios de rol, inserciones de prueba y consultas de este documento ocurrieron contra el proyecto remoto o dentro del workspace temporal; el repositorio solo se modificó para los archivos de documentación de esta fase y (en la sub-fase anterior) para la migración correctiva ya commiteada en `500b443`.

## 12. Limitaciones

- La suite de validación remota es SQL plano ad hoc, no una suite pgTAP reutilizable con reporte TAP estándar. Si en el futuro se resuelve el acceso al esquema `extensions` (por ejemplo, habilitando pgTAP desde el Dashboard de Supabase con una cuenta que sí sea dueña de ese esquema), podría reconstruirse una versión pgTAP equivalente.
- El script de validación remota vive únicamente en el workspace temporal (fuera del repositorio) y no quedó incorporado a la suite de pruebas versionada; solo el smoke test local (`supabase/tests/perfume_store_transactional_stock.sql`) está en el repositorio.
- La prueba de concurrencia real (dos conexiones independientes) solo se validó contra PostgreSQL local en Fase 1C; no se repitió contra el remoto en esta fase (el enunciado de Fase 1D-A explícitamente no pidió repetirla, para no dejar sesiones o locks colgando sobre el proyecto remoto).
- `business_settings` sigue con el valor genérico de la migración (`costo_despacho_semanal = 4000`, sin datos bancarios ni de contacto reales); debe configurarse con los datos reales del negocio antes de recibir tráfico real.

## 13. Checklist de cierre de Fase 1D-A

- [x] Workspace temporal vinculado únicamente al project ref correcto, nunca el repositorio.
- [x] Solo las migraciones canónicas de Perfume Store se aplicaron al remoto (ninguna heredada de Pauli Store).
- [x] `migration list --linked`: local y remoto alineados en las tres migraciones.
- [x] `db lint --linked --fail-on error`: código 0.
- [x] Suite de validación remota (SQL plano): 18/18 escenarios, `ROLLBACK` final.
- [x] Cero datos de prueba persistentes (verificado por separado).
- [x] Cero permisos nuevos persistentes (verificado por separado).
- [x] Ningún secreto (contraseña, token, service role key, connection string) impreso o guardado.
- [x] Repositorio real sin cambios de código; solo documentación.
- [x] `.vscode/` sin seguimiento.
- [ ] Administrador inicial (pendiente, fuera de alcance de esta fase).
- [ ] Vercel configurado (pendiente, fuera de alcance de esta fase).
- [ ] Importación de catálogo real de productos (pendiente, fuera de alcance de esta fase).

## 14. Siguiente fase recomendada

**Fase 1D-B**: configuración del administrador inicial (`usuarios_admin`) y de `business_settings` con los datos reales del negocio contra el proyecto remoto, seguido de la configuración de Vercel (variables de entorno de Supabase, dominio) — ambas siguen pendientes y fuera del alcance autorizado de esta fase.
