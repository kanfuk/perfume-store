# Propuesta: atomicidad real del máximo de 10 en Ofertas de la semana

Fase 7.4A. Este documento existe porque la instrucción de la fase es
explícita: si cerrar la brecha de concurrencia requiere una función SQL,
RPC, trigger, constraint o migración, hay que **detenerse antes de
crearla** y documentar la propuesta en su lugar. **Nada de lo descrito aquí
fue aplicado a ninguna base de datos.**

## 1. Escenario de carrera exacto

Estado inicial: 9 productos con `es_oferta_semana = true` (`OFFERS_LIMIT - 1`).

1. El admin A hace clic en "Agregar" sobre el producto A.
2. Casi simultáneamente, el admin B (u otra pestaña del mismo admin) hace
   clic en "Agregar" sobre el producto B.
3. Ambas peticiones llegan a `POST /api/admin/ofertas` casi al mismo tiempo.
4. `services/productoService.ts` → `activarOfertaSemana` ejecuta, para cada
   una, dos operaciones **separadas** contra Supabase:
   - `SELECT` de todos los productos, cuenta cuántos tienen
     `es_oferta_semana = true` (lectura).
   - Si el conteo es `< OFFERS_LIMIT`, `UPDATE` del producto elegido
     (escritura), sin ninguna condición en el `WHERE` que dependa del
     conteo.
5. Si el `SELECT` de ambas peticiones ocurre antes de que cualquiera de las
   dos complete su `UPDATE`, **ambas leen 9** y ambas pasan la validación
   `activas < 10`. Las dos escrituras se ejecutan y el catálogo termina con
   **11** productos en oferta.

Esto está **reproducido y probado** en
`tests/services/productoService.ofertasConcurrency.test.ts` (contra el
repositorio en memoria usado en tests, que reproduce el mismo patrón
"leer conteo, luego escribir" en dos pasos separados que tendría Supabase
bajo tráfico concurrente real). El primer test de ese archivo demuestra que,
con 9 ofertas activas, dos activaciones concurrentes para productos
distintos **ambas tienen éxito**, terminando en `OFFERS_LIMIT + 1` (11)
ofertas activas.

## 2. Impacto

- El catálogo público (`OffersSection.tsx`) mostraría 11 productos en vez de
  10. No hay corrupción de datos, no hay pérdida de información, no hay
  impacto en stock, costos, precios ni pedidos — el único efecto visible es
  que "Ofertas de la semana" temporalmente excede su cupo declarado hasta
  que un admin retire uno manualmente.
- No es explotable por un cliente externo: `/api/admin/ofertas` exige sesión
  admin (`isAdminAuthenticated`) y origen confiable
  (`validateTrustedOrigin`). Solo un administrador autenticado puede
  activar una oferta.

## 3. Nivel de riesgo real

**Bajo**, considerando que:

- Es una pantalla administrativa interna, no una operación de checkout ni
  de stock.
- El catálogo productivo está vacío hoy; no hay uso concurrente real
  todavía.
- El escenario requiere dos administradores (o dos pestañas) activando
  ofertas distintas en la misma ventana de milisegundos — muy improbable en
  la operación real de esta tienda (un solo admin, uso esporádico).
- El peor caso observable es "11 en vez de 10 ofertas", corregible con un
  clic ("Quitar") y sin efectos secundarios en otros datos.

Por eso esta fase **no bloquea el merge por este motivo** (ver
recomendación final en el informe de entrega), pero el riesgo queda
documentado explícitamente en vez de darse por resuelto.

## 4. Por qué la solución actual no es atómica

`actualizarProducto` en `repositories/productRepository.ts` sí soporta
compare-and-swap **fila por fila** (ver `actualizarImagenProductoSiCoincide`,
usado por el reemplazo atómico de imágenes: `UPDATE ... WHERE id = ? AND
image_storage_path = ?`). Ese patrón funciona porque la condición de carrera
se puede expresar como una comparación sobre **la misma fila** que se está
actualizando.

El límite de ofertas es distinto: la condición depende de un **conteo
agregado sobre toda la tabla** (`COUNT(*) WHERE es_oferta_semana = true`),
no de un valor de la propia fila. Ni el cliente de Supabase JS ni un
`UPDATE ... WHERE` de una sola fila pueden expresar "solo actualiza esta
fila si el conteo total de otra condición es menor que N" de forma atómica.
Eso requiere una de estas opciones, todas fuera del alcance autorizado de
esta fase:

- una función SQL (`RPC`) que envuelva `SELECT ... FOR UPDATE` + `UPDATE` en
  una sola transacción;
- un trigger `BEFORE UPDATE`/`BEFORE INSERT` con una comprobación de conteo
  y `RAISE EXCEPTION` si se excede el máximo;
- una tabla auxiliar de "cupos" con un `UPDATE ... WHERE cupos_usados < 10
  RETURNING` atómico;
- un advisory lock de Postgres (`pg_advisory_xact_lock`) alrededor de la
  transacción, también vía RPC.

Ninguna de estas se creó en esta fase.

## 5. Solución recomendada (propuesta, no aplicada)

La opción más simple y auditable es una función SQL (`RPC`) que haga el
conteo y la escritura dentro de una única transacción, usando `SELECT ...
FOR UPDATE` sobre las filas relevantes para serializar los intentos
concurrentes:

```sql
-- PROPUESTA, NO APLICADA. Requiere revisión y aprobación explícita antes
-- de crearse en Supabase.
create or replace function activate_weekly_offer_v1(
  p_product_id uuid,
  p_precio_anterior numeric default null,
  p_offers_limit integer default 10
)
returns productos
language plpgsql
security definer
as $$
declare
  v_producto productos;
  v_activas integer;
begin
  -- Bloquea la fila del producto para evitar activaciones duplicadas
  -- concurrentes del mismo producto.
  select * into v_producto from productos where id = p_product_id for update;

  if v_producto is null then
    raise exception 'PRODUCT_NOT_FOUND';
  end if;

  if v_producto.activo is false and v_producto.es_oferta_semana is false then
    raise exception 'PRODUCT_INACTIVE';
  end if;

  if v_producto.es_oferta_semana is false then
    -- Bloquea el conteo global para serializar activaciones concurrentes.
    select count(*) into v_activas from productos where es_oferta_semana = true for update;

    if v_activas >= p_offers_limit then
      raise exception 'OFFERS_LIMIT_REACHED';
    end if;
  end if;

  update productos
    set es_oferta_semana = true,
        precio_anterior = coalesce(p_precio_anterior, precio_anterior)
    where id = p_product_id
    returning * into v_producto;

  return v_producto;
end;
$$;
```

### Contrato de entrada/salida propuesto

**Entrada:** `productId: string (uuid)`, `precioAnterior?: number` (mismas
reglas de validación que hoy: finito, > 0).

**Salida (éxito):** el registro completo del producto actualizado (mismo
shape que `actualizarProducto` retorna hoy).

**Códigos de error propuestos** (mapeados desde el mensaje de la excepción
Postgres, igual que ya se hace con `create_perfume_order_v1` y las demás RPC
existentes en `repositories/pedidoRepository.ts`):

| Excepción Postgres      | Error de aplicación                                              |
| ------------------------ | ------------------------------------------------------------------ |
| `PRODUCT_NOT_FOUND`      | "Producto no encontrado."                                         |
| `PRODUCT_INACTIVE`       | "No se puede agregar a Ofertas de la semana un producto pausado." |
| `OFFERS_LIMIT_REACHED`   | "Ya hay 10 productos en Ofertas de la semana..."                  |

### Estrategia de rollback

Ninguna necesaria más allá de la transacción implícita de la función: si
cualquier `raise exception` se dispara, Postgres revierte automáticamente
todo lo hecho dentro de la función (no hay escritura parcial posible). No se
requiere lógica de compensación en la aplicación.

### Pruebas que deberían agregarse si se implementa esta propuesta

- Prueba de integración contra una base Postgres real (no el stub en
  memoria) con dos conexiones concurrentes reales activando ofertas
  distintas al llegar a 9 activas, confirmando que el conteo final nunca
  supera `OFFERS_LIMIT`.
- Prueba de que la RPC serializa dos activaciones del **mismo** producto
  (no debe duplicar ni fallar de forma confusa).
- Prueba de que `PRODUCT_INACTIVE` se dispara solo en una activación nueva,
  nunca al actualizar `precioAnterior` de una oferta ya activa.
- Prueba de que un rollback por excepción no deja la fila del producto
  parcialmente modificada.
- Actualizar `tests/services/productoService.ofertasConcurrency.test.ts`
  para reflejar el nuevo comportamiento atómico (el primer test de ese
  archivo debería empezar a fallar — es decir, `succeeded` pasaría a ser 1,
  no 2 — una vez migrada la función; en ese momento ese test deja de
  documentar un riesgo y pasa a ser una regresión real si algo lo rompe).

## 6. Confirmación

Esta propuesta **no fue aplicada**. No se creó ninguna función, RPC,
trigger, constraint ni migración en Supabase. El código de
`activarOfertaSemana` sigue usando el patrón no atómico (leer conteo, luego
escribir), documentado en el JSDoc del método y probado explícitamente en
`tests/services/productoService.ofertasConcurrency.test.ts`.
