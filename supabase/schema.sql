# PAULI STORE - CORREGIR MENSAJE DE WHATSAPP CON LINK DE LA APP

## 1. Problema detectado

El botón de WhatsApp de Pauli Store actualmente abre WhatsApp con este mensaje:

```txt
Hola! Tus dobladitas favoritas de siempre ahora pueden ser reservadas a traves de nuestra app. No te quedes sin la tuya: agenda con anticipacion y reserva tu desayuno 🤗
```

El problema es que **el mensaje no incluye el link de la app**, por lo que el cliente recibe el texto, pero no tiene acceso directo al sitio para reservar.

La URL pública correcta es:

```txt
https://pauli-store-clientes.vercel.app/
```

---

## 2. Objetivo

Corregir todos los botones/enlaces de WhatsApp para que el mensaje incluya el link público de la app.

El mensaje final debe ser:

```txt
Hola! Tus dobladitas favoritas de siempre ahora pueden ser reservadas a través de nuestra app. No te quedes sin la tuya: agenda con anticipación y reserva tu desayuno 🤗

Ingresa aquí:
https://pauli-store-clientes.vercel.app/
```

---

## 3. Alcance

Aplicar esta corrección en todos los lugares donde exista un botón o enlace de WhatsApp relacionado con:

* botón flotante de WhatsApp;
* botón de contacto;
* botón de compartir app;
* botón del home;
* botón del catálogo;
* botón de reserva;
* cualquier `window.open` hacia WhatsApp;
* cualquier `<a href="https://wa.me/...">`;
* cualquier `<a href="https://api.whatsapp.com/send?...">`.

---

## 4. Archivos probables a revisar

Buscar en el proyecto por estas palabras:

```txt
whatsapp
WhatsApp
wa.me
api.whatsapp.com
window.open
mensajeWhatsApp
whatsappMessage
WHATSAPP_MESSAGE
WHATSAPP_PHONE
phoneNumber
whatsappUrl
FloatingWhatsApp
WhatsAppButton
```

Posibles archivos:

```txt
src/App.tsx
src/components/WhatsAppButton.tsx
src/components/FloatingWhatsApp.tsx
src/components/Home.tsx
src/components/Layout.tsx
src/pages/index.tsx
src/pages/Home.tsx
src/lib/whatsapp.ts
src/utils/whatsapp.ts
src/constants.ts
src/config.ts
```

---

## 5. Regla técnica principal

El texto del mensaje debe pasar por:

```ts
encodeURIComponent()
```

No concatenar el mensaje manualmente dentro de la URL sin codificar.

Correcto:

```ts
const whatsappUrl = `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`;
```

Incorrecto:

```ts
const whatsappUrl = `https://wa.me/${WHATSAPP_PHONE}?text=${WHATSAPP_MESSAGE}`;
```

---

## 6. No cambiar el número de WhatsApp

Mantener el número actual que ya usa el proyecto.

No inventar otro número.

Si existe una constante como:

```ts
WHATSAPP_PHONE
PAULI_PHONE
phoneNumber
whatsappNumber
```

mantenerla.

Solo modificar el mensaje.

---

## 7. Implementación recomendada

Si existe archivo de utilidades, usarlo. Si no existe, crear uno.

Crear o actualizar:

```txt
src/lib/whatsapp.ts
```

con este contenido:

```ts
export const PUBLIC_APP_URL = 'https://pauli-store-clientes.vercel.app/';

export const WHATSAPP_INVITE_MESSAGE = `Hola! Tus dobladitas favoritas de siempre ahora pueden ser reservadas a través de nuestra app. No te quedes sin la tuya: agenda con anticipación y reserva tu desayuno 🤗

Ingresa aquí:
${PUBLIC_APP_URL}`;

export function buildWhatsAppUrl(phone: string, message = WHATSAPP_INVITE_MESSAGE) {
  const cleanPhone = phone.replace(/\D/g, '');
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}
```

---

## 8. Uso en componentes

En cualquier componente donde exista el botón de WhatsApp, usar el helper anterior.

Ejemplo:

```tsx
import { buildWhatsAppUrl } from '@/lib/whatsapp';

const WHATSAPP_PHONE = '569XXXXXXXX'; // mantener el número real existente

export function WhatsAppButton() {
  const whatsappUrl = buildWhatsAppUrl(WHATSAPP_PHONE);

  return (
    <a
      href={whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Enviar mensaje por WhatsApp"
    >
      WhatsApp
    </a>
  );
}
```

Si el proyecto no usa alias `@/`, ajustar import según estructura real:

```tsx
import { buildWhatsAppUrl } from '../lib/whatsapp';
```

o:

```tsx
import { buildWhatsAppUrl } from '../../lib/whatsapp';
```

---

## 9. Si el botón usa window.open

Si el código actual usa algo como:

```ts
window.open(whatsappUrl);
```

reemplazar por:

```ts
const handleWhatsAppClick = () => {
  const whatsappUrl = buildWhatsAppUrl(WHATSAPP_PHONE);
  window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
};
```

---

## 10. Si el botón tiene href directo

Si el botón tiene algo parecido a:

```tsx
<a href={`https://wa.me/${phone}?text=${message}`}>
```

reemplazar por:

```tsx
<a
  href={buildWhatsAppUrl(WHATSAPP_PHONE)}
  target="_blank"
  rel="noopener noreferrer"
>
```

---

## 11. Mensaje exacto que debe quedar

El mensaje visible en WhatsApp debe ser exactamente:

```txt
Hola! Tus dobladitas favoritas de siempre ahora pueden ser reservadas a través de nuestra app. No te quedes sin la tuya: agenda con anticipación y reserva tu desayuno 🤗

Ingresa aquí:
https://pauli-store-clientes.vercel.app/
```

Corregir ortografía:

* `traves` → `través`
* `anticipacion` → `anticipación`

---

## 12. Revisión de múltiples botones

Buscar todos los botones de WhatsApp y evitar mensajes duplicados distintos.

Todos deben usar la misma fuente:

```ts
WHATSAPP_INVITE_MESSAGE
```

y el mismo builder:

```ts
buildWhatsAppUrl()
```

No dejar un botón con el mensaje antiguo.

---

## 13. No modificar

No tocar:

```txt
Supabase
productos
stock
stock_actual
stock_agenda
pedidos
pedido_items
clientes
pagos
fiados
reportes
login admin
branding
rutas principales
estructura de base de datos
```

Esta tarea solo corrige el mensaje y enlace de WhatsApp.

---

## 14. Validación manual

Después de aplicar el cambio:

1. Abrir:

```txt
https://pauli-store-clientes.vercel.app/
```

2. Presionar el botón de WhatsApp.

3. Verificar que WhatsApp abre con este mensaje completo:

```txt
Hola! Tus dobladitas favoritas de siempre ahora pueden ser reservadas a través de nuestra app. No te quedes sin la tuya: agenda con anticipación y reserva tu desayuno 🤗

Ingresa aquí:
https://pauli-store-clientes.vercel.app/
```

4. Confirmar que:

   * el link aparece dentro del mensaje;
   * el link queda clickeable;
   * las tildes se ven bien;
   * el emoji se ve bien;
   * no aparece `%20`;
   * no aparece `%0A`;
   * no aparece texto codificado visible al usuario;
   * el botón abre WhatsApp Web o WhatsApp App correctamente.

---

## 15. Validación técnica

Revisar que la URL generada tenga una estructura similar a:

```txt
https://wa.me/569XXXXXXXX?text=...
```

El texto dentro del parámetro `text` debe estar codificado por `encodeURIComponent`, pero WhatsApp debe mostrarlo decodificado correctamente al usuario.

---

## 16. Build

Después de modificar:

```bash
npm run build
```

o según el proyecto:

```bash
pnpm build
```

Verificar que no existan errores TypeScript.

---

## 17. Criterio de aceptación

La tarea está terminada cuando:

1. El botón de WhatsApp abre correctamente.
2. El mensaje incluye el link de la app.
3. El link es clickeable.
4. Las tildes y emoji se ven bien.
5. Todos los botones de WhatsApp usan el mismo mensaje.
6. No se modifica ninguna lógica de base de datos.
7. No se rompen pedidos, stock, pagos ni fiados.

---

## 18. Resultado final esperado

```txt
Hola! Tus dobladitas favoritas de siempre ahora pueden ser reservadas a través de nuestra app. No te quedes sin la tuya: agenda con anticipación y reserva tu desayuno 🤗

Ingresa aquí:
https://pauli-store-clientes.vercel.app/
```
onstraint
    where conname = 'pedido_items_cantidad_check'
  ) then
    alter table pedido_items
    add constraint pedido_items_cantidad_check
    check (cantidad >= 1);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'productos_precio_check'
  ) then
    alter table productos
    add constraint productos_precio_check
    check (precio_venta >= 0 and costo_unitario >= 0 and stock_actual >= 0 and stock_agenda >= 0);
  end if;
end $$;

create or replace function set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists clientes_set_updated_at on clientes;
create trigger clientes_set_updated_at
before update on clientes
for each row
execute function set_updated_at();

drop trigger if exists productos_set_updated_at on productos;
create trigger productos_set_updated_at
before update on productos
for each row
execute function set_updated_at();

drop trigger if exists pedidos_set_updated_at on pedidos;
create trigger pedidos_set_updated_at
before update on pedidos
for each row
execute function set_updated_at();

drop trigger if exists fiados_set_updated_at on fiados;
create trigger fiados_set_updated_at
before update on fiados
for each row
execute function set_updated_at();

drop trigger if exists usuarios_admin_set_updated_at on usuarios_admin;
create trigger usuarios_admin_set_updated_at
before update on usuarios_admin
for each row
execute function set_updated_at();

alter table clientes enable row level security;
alter table productos enable row level security;
alter table pedidos enable row level security;
alter table pedido_items enable row level security;
alter table pagos enable row level security;
alter table fiados enable row level security;
alter table usuarios_admin enable row level security;

drop function if exists public.rls_auto_enable();

-- Politicas iniciales minimas para MVP.
drop policy if exists "public_can_read_active_products" on productos;
create policy "public_can_read_active_products"
on productos
for select
using (activo = true);

drop policy if exists "admin_can_manage_productos" on productos;
create policy "admin_can_manage_productos"
on productos
for all
to authenticated
using (
  exists (
    select 1
    from usuarios_admin
    where usuarios_admin.email = auth.email()
      and usuarios_admin.activo = true
  )
)
with check (
  exists (
    select 1
    from usuarios_admin
    where usuarios_admin.email = auth.email()
      and usuarios_admin.activo = true
  )
);

drop policy if exists "public_can_insert_clientes" on clientes;
-- Los inserts de clientes se hacen desde el servidor con service role.
-- No dejamos una politica publica abierta para evitar inserciones directas.

drop policy if exists "admin_can_read_clientes" on clientes;
create policy "admin_can_read_clientes"
on clientes
for select
to authenticated
using (
  exists (
    select 1
    from usuarios_admin
    where usuarios_admin.email = auth.email()
      and usuarios_admin.activo = true
  )
);

drop policy if exists "public_can_insert_pedidos" on pedidos;
create policy "public_can_insert_pedidos"
on pedidos
for insert
with check (
  estado_pedido = 'PENDIENTE'
  and estado_pago = 'SIN_PAGO'
  and total >= 0
);

drop policy if exists "admin_can_manage_pedidos" on pedidos;
create policy "admin_can_manage_pedidos"
on pedidos
for all
to authenticated
using (
  exists (
    select 1
    from usuarios_admin
    where usuarios_admin.email = auth.email()
      and usuarios_admin.activo = true
  )
)
with check (
  exists (
    select 1
    from usuarios_admin
    where usuarios_admin.email = auth.email()
      and usuarios_admin.activo = true
  )
);

drop policy if exists "public_can_insert_pedido_items" on pedido_items;
create policy "public_can_insert_pedido_items"
on pedido_items
for insert
with check (
  cantidad >= 1
  and subtotal >= 0
);

drop policy if exists "admin_can_read_pedido_items" on pedido_items;
create policy "admin_can_read_pedido_items"
on pedido_items
for select
to authenticated
using (
  exists (
    select 1
    from usuarios_admin
    where usuarios_admin.email = auth.email()
      and usuarios_admin.activo = true
  )
);

drop policy if exists "admin_can_manage_pagos" on pagos;
create policy "admin_can_manage_pagos"
on pagos
for all
to authenticated
using (
  exists (
    select 1
    from usuarios_admin
    where usuarios_admin.email = auth.email()
      and usuarios_admin.activo = true
  )
)
with check (
  exists (
    select 1
    from usuarios_admin
    where usuarios_admin.email = auth.email()
      and usuarios_admin.activo = true
  )
);

drop policy if exists "admin_can_manage_fiados" on fiados;
create policy "admin_can_manage_fiados"
on fiados
for all
to authenticated
using (
  exists (
    select 1
    from usuarios_admin
    where usuarios_admin.email = auth.email()
      and usuarios_admin.activo = true
  )
)
with check (
  exists (
    select 1
    from usuarios_admin
    where usuarios_admin.email = auth.email()
      and usuarios_admin.activo = true
  )
);

drop policy if exists "admin_can_read_own_profile" on usuarios_admin;
create policy "admin_can_read_own_profile"
on usuarios_admin
for select
to authenticated
using (email = auth.email() and activo = true);

create table if not exists operaciones_admin_log (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,
  periodo text not null,
  ejecutado_por_email text not null,
  ejecutado_por_nombre text,
  resumen jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone default now()
);

create table if not exists archivo_clientes (
  id uuid primary key default gen_random_uuid(),
  operacion_id uuid not null references operaciones_admin_log(id),
  original_cliente_id uuid,
  payload jsonb not null,
  created_at timestamp with time zone default now()
);

create table if not exists archivo_pedidos (
  id uuid primary key default gen_random_uuid(),
  operacion_id uuid not null references operaciones_admin_log(id),
  original_pedido_id uuid,
  payload jsonb not null,
  created_at timestamp with time zone default now()
);

create table if not exists archivo_pedido_items (
  id uuid primary key default gen_random_uuid(),
  operacion_id uuid not null references operaciones_admin_log(id),
  original_pedido_item_id uuid,
  payload jsonb not null,
  created_at timestamp with time zone default now()
);

create table if not exists archivo_pagos (
  id uuid primary key default gen_random_uuid(),
  operacion_id uuid not null references operaciones_admin_log(id),
  original_pago_id uuid,
  payload jsonb not null,
  created_at timestamp with time zone default now()
);

create table if not exists archivo_fiados (
  id uuid primary key default gen_random_uuid(),
  operacion_id uuid not null references operaciones_admin_log(id),
  original_fiado_id uuid,
  payload jsonb not null,
  created_at timestamp with time zone default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'operaciones_admin_log_tipo_check'
  ) then
    alter table operaciones_admin_log
    add constraint operaciones_admin_log_tipo_check
    check (tipo in ('CIERRE_MENSUAL', 'LIMPIEZA_PRELANZAMIENTO'));
  end if;
end $$;

create or replace function admin_cerrar_mes_operativo(
  p_admin_email text,
  p_admin_nombre text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operacion_id uuid := gen_random_uuid();
  v_periodo text := to_char(timezone('America/Santiago', now()), 'YYYY-MM');
  v_pedidos integer := 0;
  v_clientes integer := 0;
  v_items integer := 0;
  v_pagos integer := 0;
  v_fiados integer := 0;
  v_total_ventas integer := 0;
  v_pendientes integer := 0;
  v_agendados integer := 0;
  v_resumen jsonb;
begin
  select count(*) into v_pendientes
  from pedidos
  where estado_pedido = 'PENDIENTE';

  select count(*) into v_agendados
  from pedidos
  where estado_pedido = 'AGENDADO';

  if v_pendientes > 0 or v_agendados > 0 then
    raise exception 'No se puede cerrar el mes mientras existan pedidos pendientes o agendados.';
  end if;

  select count(*), coalesce(sum(total), 0)
  into v_pedidos, v_total_ventas
  from pedidos;

  select count(*) into v_clientes from clientes;
  select count(*) into v_items from pedido_items;
  select count(*) into v_pagos from pagos;
  select count(*) into v_fiados from fiados;

  if v_pedidos = 0 and v_clientes = 0 and v_items = 0 and v_pagos = 0 and v_fiados = 0 then
    raise exception 'No hay data operativa para cerrar.';
  end if;

  v_resumen := jsonb_build_object(
    'pedidos', v_pedidos,
    'clientes', v_clientes,
    'items', v_items,
    'pagos', v_pagos,
    'fiados', v_fiados,
    'totalVentas', v_total_ventas
  );

  insert into operaciones_admin_log (
    id,
    tipo,
    periodo,
    ejecutado_por_email,
    ejecutado_por_nombre,
    resumen
  ) values (
    v_operacion_id,
    'CIERRE_MENSUAL',
    v_periodo,
    p_admin_email,
    p_admin_nombre,
    v_resumen
  );

  insert into archivo_clientes (operacion_id, original_cliente_id, payload)
  select v_operacion_id, c.id, to_jsonb(c)
  from clientes c;

  insert into archivo_pedidos (operacion_id, original_pedido_id, payload)
  select v_operacion_id, p.id, to_jsonb(p)
  from pedidos p;

  insert into archivo_pedido_items (operacion_id, original_pedido_item_id, payload)
  select v_operacion_id, pi.id, to_jsonb(pi)
  from pedido_items pi;

  insert into archivo_pagos (operacion_id, original_pago_id, payload)
  select v_operacion_id, pa.id, to_jsonb(pa)
  from pagos pa;

  insert into archivo_fiados (operacion_id, original_fiado_id, payload)
  select v_operacion_id, f.id, to_jsonb(f)
  from fiados f;

  delete from fiados;
  delete from pagos;
  delete from pedido_items;
  delete from pedidos;
  delete from clientes;

  return jsonb_build_object(
    'operationId', v_operacion_id,
    'tipo', 'CIERRE_MENSUAL',
    'periodo', v_periodo,
    'resumen', v_resumen,
    'message', 'Cierre mensual completado. La operacion quedo archivada y el panel operativo quedo limpio.'
  );
end;
$$;

create or replace function admin_limpiar_datos_prueba(
  p_admin_email text,
  p_admin_nombre text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operacion_id uuid := gen_random_uuid();
  v_periodo text := to_char(timezone('America/Santiago', now()), 'YYYY-MM');
  v_pedidos integer := 0;
  v_clientes integer := 0;
  v_items integer := 0;
  v_pagos integer := 0;
  v_fiados integer := 0;
  v_total_ventas integer := 0;
  v_resumen jsonb;
begin
  select count(*), coalesce(sum(total), 0)
  into v_pedidos, v_total_ventas
  from pedidos;

  select count(*) into v_clientes from clientes;
  select count(*) into v_items from pedido_items;
  select count(*) into v_pagos from pagos;
  select count(*) into v_fiados from fiados;

  if v_pedidos = 0 and v_clientes = 0 and v_items = 0 and v_pagos = 0 and v_fiados = 0 then
    raise exception 'No hay data operativa para limpiar.';
  end if;

  v_resumen := jsonb_build_object(
    'pedidos', v_pedidos,
    'clientes', v_clientes,
    'items', v_items,
    'pagos', v_pagos,
    'fiados', v_fiados,
    'totalVentas', v_total_ventas
  );

  insert into operaciones_admin_log (
    id,
    tipo,
    periodo,
    ejecutado_por_email,
    ejecutado_por_nombre,
    resumen
  ) values (
    v_operacion_id,
    'LIMPIEZA_PRELANZAMIENTO',
    v_periodo,
    p_admin_email,
    p_admin_nombre,
    v_resumen
  );

  delete from fiados;
  delete from pagos;
  delete from pedido_items;
  delete from pedidos;
  delete from clientes;

  return jsonb_build_object(
    'operationId', v_operacion_id,
    'tipo', 'LIMPIEZA_PRELANZAMIENTO',
    'periodo', v_periodo,
    'resumen', v_resumen,
    'message', 'Limpieza de datos de prueba completada. Productos y stock se conservaron.'
  );
end;
$$;

alter table operaciones_admin_log enable row level security;
alter table archivo_clientes enable row level security;
alter table archivo_pedidos enable row level security;
alter table archivo_pedido_items enable row level security;
alter table archivo_pagos enable row level security;
alter table archivo_fiados enable row level security;

drop policy if exists "admin_can_read_operaciones_admin_log" on operaciones_admin_log;
create policy "admin_can_read_operaciones_admin_log"
on operaciones_admin_log
for select
to authenticated
using (
  exists (
    select 1
    from usuarios_admin
    where usuarios_admin.email = auth.email()
      and usuarios_admin.activo = true
  )
);

drop policy if exists "admin_can_read_archivo_clientes" on archivo_clientes;
create policy "admin_can_read_archivo_clientes"
on archivo_clientes
for select
to authenticated
using (
  exists (
    select 1
    from usuarios_admin
    where usuarios_admin.email = auth.email()
      and usuarios_admin.activo = true
  )
);

drop policy if exists "admin_can_read_archivo_pedidos" on archivo_pedidos;
create policy "admin_can_read_archivo_pedidos"
on archivo_pedidos
for select
to authenticated
using (
  exists (
    select 1
    from usuarios_admin
    where usuarios_admin.email = auth.email()
      and usuarios_admin.activo = true
  )
);

drop policy if exists "admin_can_read_archivo_pedido_items" on archivo_pedido_items;
create policy "admin_can_read_archivo_pedido_items"
on archivo_pedido_items
for select
to authenticated
using (
  exists (
    select 1
    from usuarios_admin
    where usuarios_admin.email = auth.email()
      and usuarios_admin.activo = true
  )
);

drop policy if exists "admin_can_read_archivo_pagos" on archivo_pagos;
create policy "admin_can_read_archivo_pagos"
on archivo_pagos
for select
to authenticated
using (
  exists (
    select 1
    from usuarios_admin
    where usuarios_admin.email = auth.email()
      and usuarios_admin.activo = true
  )
);

drop policy if exists "admin_can_read_archivo_fiados" on archivo_fiados;
create policy "admin_can_read_archivo_fiados"
on archivo_fiados
for select
to authenticated
using (
  exists (
    select 1
    from usuarios_admin
    where usuarios_admin.email = auth.email()
      and usuarios_admin.activo = true
  )
);
