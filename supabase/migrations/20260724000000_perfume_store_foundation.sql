-- Perfume Store
-- Migracion consolidada de fundacion, pensada para ejecutarse una sola vez
-- sobre un proyecto Supabase Postgres completamente vacio.
--
-- Fuente canonica: este archivo (y su espejo logico en supabase/schema.sql)
-- reemplazan cualquier historial de migraciones previo como punto de partida.
-- Las migraciones heredadas en supabase/migrations/ anteriores a esta fecha
-- se conservan solo por trazabilidad historica de Pauli Store; no deben
-- ejecutarse contra el proyecto Supabase nuevo. Ver
-- docs/PERFUME_STORE_DATABASE_FOUNDATION.md para el detalle completo.
--
-- No contiene datos reales de clientes, pedidos, productos ni credenciales.

create extension if not exists pgcrypto;

-- ============================================================
-- Funciones de apoyo (deben existir antes de los triggers/policies)
-- ============================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- Tabla: usuarios_admin
-- Lista blanca de administradores autorizados. La autenticacion la resuelve
-- Supabase Auth; esta tabla decide autorizacion (quien, ademas de estar
-- autenticado, puede operar el panel admin).
-- ============================================================

create table if not exists public.usuarios_admin (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  nombre text,
  rol text not null default 'ADMIN',
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- is_active_admin() debe definirse DESPUES de crear usuarios_admin: al ser
-- "language sql" (no plpgsql), Postgres analiza su cuerpo contra el catalogo
-- en el momento de CREATE FUNCTION, no en la primera llamada. Si la tabla
-- todavia no existe, la migracion falla con "relation does not exist" sobre
-- una base de datos realmente vacia.
create or replace function public.is_active_admin()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios_admin
    where usuarios_admin.email = auth.email()
      and usuarios_admin.activo = true
  );
$$;

-- ============================================================
-- Tabla: clientes
-- Ampliada respecto a Pauli Store para cubrir los datos que exige el
-- negocio de perfumes (RUT, correo, region, comuna, direccion).
-- lugar_trabajo se conserva como columna legado (ver documentacion),
-- ahora opcional en base de datos para no bloquear una futura migracion
-- de clientes historicos que no tengan ese dato.
-- ============================================================

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  rut text,
  email text,
  telefono text,
  region text,
  comuna text,
  direccion text,
  referencia_direccion text,
  lugar_trabajo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.clientes.lugar_trabajo is
  'Legado de Pauli Store (venta informal). No usar como direccion. Conservado solo por compatibilidad temporal con codigo heredado.';

create index if not exists clientes_telefono_idx
  on public.clientes (telefono)
  where telefono is not null;

create index if not exists clientes_rut_idx
  on public.clientes (rut)
  where rut is not null;

create index if not exists clientes_email_idx
  on public.clientes (email)
  where email is not null;

-- ============================================================
-- Tabla: productos
-- Extiende el producto de Pauli Store con los campos minimos de un
-- catalogo de perfumes (marca, contenido/volumen, SKU, destacados,
-- ofertas) y agrega stock_reservado como columna estructural para una
-- futura estrategia anti-sobreventa (todavia sin funcion asociada).
-- stock_agenda se conserva como columna de compatibilidad: el
-- repositorio heredado (repositories/productRepository.ts) la lee y
-- escribe junto a stock_actual como "stock unificado".
-- ============================================================

create table if not exists public.productos (
  id uuid primary key default gen_random_uuid(),
  sku text,
  nombre text not null,
  marca text,
  contenido text,
  descripcion text,
  precio_venta integer not null,
  precio_anterior integer,
  costo_unitario integer not null default 0,
  stock_actual integer not null default 0,
  stock_agenda integer not null default 0,
  stock_reservado integer not null default 0,
  stock_minimo integer not null default 0,
  activo boolean not null default true,
  es_top boolean not null default false,
  es_oferta_semana boolean not null default false,
  orden_destacado integer,
  tipo_producto text,
  image_url text,
  image_storage_path text,
  badge_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint productos_precio_venta_check check (precio_venta >= 0),
  constraint productos_precio_anterior_check check (precio_anterior is null or precio_anterior >= 0),
  constraint productos_costo_unitario_check check (costo_unitario >= 0),
  constraint productos_stock_actual_check check (stock_actual >= 0),
  constraint productos_stock_agenda_check check (stock_agenda >= 0),
  constraint productos_stock_minimo_check check (stock_minimo >= 0),
  constraint productos_stock_reservado_check check (
    stock_reservado >= 0 and stock_reservado <= stock_actual
  )
);

comment on column public.productos.stock_agenda is
  'Legado de Pauli Store: espejo de stock_actual mantenido por el repositorio heredado ("stock unificado"). No introduce una segunda fuente de verdad; ambas columnas se escriben juntas.';
comment on column public.productos.stock_reservado is
  'Reservado para una futura estrategia de reserva de stock/anti-sobreventa. Sin funcion o trigger asociado todavia; el codigo actual no la utiliza.';
comment on column public.productos.image_url is
  'Imagen externa (URL absoluta o ruta bajo /public). Compatible con el uso actual del codigo heredado.';
comment on column public.productos.image_storage_path is
  'Ruta reservada para Supabase Storage cuando se migren imagenes fuera de /public. Sin uso todavia.';

create unique index if not exists productos_sku_unique_idx
  on public.productos (sku)
  where sku is not null;

create index if not exists productos_activo_idx on public.productos (activo);
create index if not exists productos_es_top_idx on public.productos (es_top) where es_top = true;
create index if not exists productos_es_oferta_semana_idx on public.productos (es_oferta_semana) where es_oferta_semana = true;
create index if not exists productos_tipo_producto_idx on public.productos (tipo_producto);

-- ============================================================
-- Tabla: business_settings
-- Configuracion comercial de un unico negocio (sin multi-tenant).
-- Se fuerza una sola fila mediante un id constante y un check singleton.
-- No se insertan datos comerciales reales; solo la fila vacia base.
-- ============================================================

create table if not exists public.business_settings (
  id uuid primary key default '00000000-0000-0000-0000-000000000001'::uuid,
  nombre_comercial text,
  telefono_whatsapp text,
  correo text,
  banco text,
  tipo_cuenta text,
  numero_cuenta text,
  titular_cuenta text,
  rut_titular text,
  costo_despacho_semanal integer not null default 0,
  texto_despacho_semanal text,
  umbral_stock_bajo integer not null default 0,
  color_primario text,
  color_acento text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_settings_singleton_check check (
    id = '00000000-0000-0000-0000-000000000001'::uuid
  ),
  constraint business_settings_costo_despacho_check check (costo_despacho_semanal >= 0),
  constraint business_settings_umbral_stock_check check (umbral_stock_bajo >= 0)
);

insert into public.business_settings (id)
values ('00000000-0000-0000-0000-000000000001'::uuid)
on conflict (id) do nothing;

-- ============================================================
-- Tabla: pedidos
-- Estados y metodos de despacho nuevos, orientados al negocio de
-- perfumes (agenda, pago verificado, preparacion, despacho, entrega).
-- INCOMPATIBLE con los valores que hoy escribe el codigo TypeScript
-- heredado (PENDIENTE/FINALIZADO y FIADO). Ver seccion "Estados de
-- pedido" y "Compatibilidad con el codigo heredado" en
-- docs/PERFUME_STORE_DATABASE_FOUNDATION.md: es una decision deliberada
-- de esta fase, pendiente de reconciliar con la capa TypeScript en una
-- fase posterior que esta migracion no autoriza a tocar.
-- admin_seen/admin_seen_at se conservan por compatibilidad (badge de
-- pedidos nuevos en el dashboard admin).
-- ============================================================

create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique default (
    'PS-' || to_char(now(), 'YYYYMMDD') || '-' ||
    substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)
  ),
  cliente_id uuid not null references public.clientes(id),
  estado_pedido text not null default 'NUEVO',
  estado_pago text not null default 'SIN_PAGO',
  origen_pedido text not null default 'PUBLICO',
  subtotal integer not null,
  metodo_despacho text not null,
  costo_despacho integer not null default 0,
  total integer not null,
  observacion text,
  motivo_cancelacion text,
  stock_repuesto boolean not null default false,
  admin_seen boolean not null default false,
  admin_seen_at timestamptz,
  fecha_pedido timestamptz not null default now(),
  fecha_agendado timestamptz,
  fecha_pago timestamptz,
  fecha_preparacion timestamptz,
  fecha_despacho timestamptz,
  fecha_entrega timestamptz,
  fecha_cancelacion timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pedidos_estado_pedido_check check (
    estado_pedido in (
      'NUEVO', 'AGENDADO', 'PAGADO', 'PREPARANDO',
      'DESPACHADO', 'ENTREGADO', 'CANCELADO'
    )
  ),
  constraint pedidos_estado_pago_check check (
    estado_pago in ('SIN_PAGO', 'PAGADO', 'CANCELADO')
  ),
  constraint pedidos_origen_pedido_check check (
    origen_pedido in ('PUBLICO', 'ADMIN_DIRECTO', 'PERSONALIZADO')
  ),
  constraint pedidos_metodo_despacho_check check (
    metodo_despacho in ('STARKEN_POR_PAGAR', 'DOMICILIO_SEMANAL')
  ),
  constraint pedidos_subtotal_check check (subtotal >= 0),
  constraint pedidos_costo_despacho_check check (costo_despacho >= 0),
  constraint pedidos_total_check check (total >= 0)
);

comment on column public.pedidos.stock_repuesto is
  'Bandera de idempotencia para una futura funcion de cancelacion que reponga stock exactamente una vez. Sin funcion asociada todavia; el codigo actual no la utiliza.';
comment on constraint pedidos_estado_pedido_check on public.pedidos is
  'Estados nuevos para Perfume Store. No incluye PENDIENTE ni FINALIZADO (valores usados por el dominio TypeScript heredado de Pauli Store); ver docs/PERFUME_STORE_DATABASE_FOUNDATION.md.';
comment on constraint pedidos_estado_pago_check on public.pedidos is
  'No incluye FIADO. El modulo de fiados se conserva como tabla legado (fiados) pero ya no es un estado valido de pedidos.estado_pago en este esquema.';
comment on constraint pedidos_metodo_despacho_check on public.pedidos is
  'DOMICILIO_SEMANAL no fija el valor de costo_despacho ($4.000 no esta codificado aqui); ese monto se define en business_settings.costo_despacho_semanal.';

create index if not exists pedidos_cliente_id_idx on public.pedidos (cliente_id);
create index if not exists pedidos_estado_pedido_idx on public.pedidos (estado_pedido);
create index if not exists pedidos_estado_pago_idx on public.pedidos (estado_pago);

-- ============================================================
-- Tabla: pedido_items
-- Conserva snapshot del producto en el momento del pedido para que el
-- historico no cambie si el producto se edita o elimina despues.
-- Columnas costo_unitario/total_costo/utilidad_bruta y producto_tipo se
-- mantienen por compatibilidad con repositories/pedidoRepository.ts.
-- ============================================================

create table if not exists public.pedido_items (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id),
  producto_id uuid references public.productos(id) on delete set null,
  producto_sku text,
  producto_nombre text not null,
  producto_marca text,
  producto_contenido text,
  producto_descripcion text,
  producto_image_url text,
  producto_tipo text,
  cantidad integer not null,
  precio_unitario integer not null,
  costo_unitario integer not null default 0,
  total_costo integer not null default 0,
  utilidad_bruta integer not null default 0,
  subtotal integer not null,
  created_at timestamptz not null default now(),
  constraint pedido_items_cantidad_check check (cantidad >= 1),
  constraint pedido_items_precio_unitario_check check (precio_unitario >= 0),
  constraint pedido_items_costo_unitario_check check (costo_unitario >= 0),
  constraint pedido_items_total_costo_check check (total_costo >= 0),
  constraint pedido_items_subtotal_check check (subtotal >= 0)
);

comment on column public.pedido_items.producto_id is
  'Nullable a proposito: si el producto se elimina despues, el item historico conserva su snapshot (producto_nombre, etc.) y solo pierde la referencia viva.';

create index if not exists pedido_items_pedido_id_idx on public.pedido_items (pedido_id);
create index if not exists pedido_items_producto_id_idx on public.pedido_items (producto_id);

-- ============================================================
-- Tabla: pagos
-- Registro manual de pagos (incluye transferencias bancarias verificadas
-- a mano por el admin). No se crea ninguna integracion de pago en linea.
-- estado_pago se deja como texto libre (sin CHECK) por compatibilidad:
-- el codigo heredado todavia puede escribir 'FIADO' en pagos.estado_pago
-- al registrar abonos de una cuenta fiada; formalizar un enum queda
-- pendiente para cuando se revise ese flujo.
-- ============================================================

create table if not exists public.pagos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id),
  monto integer not null,
  metodo_pago text,
  estado_pago text not null,
  fecha_pago timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint pagos_monto_check check (monto >= 0)
);

create index if not exists pagos_pedido_id_idx on public.pagos (pedido_id);

-- ============================================================
-- Tabla: fiados (legado temporal)
-- Credito informal heredado de Pauli Store. El negocio de perfumes usa
-- "transferencia bancaria verificada manualmente" en vez de fiado, pero
-- la tabla se conserva porque services/pedidoService.ts y
-- repositories/pedidoRepository.ts todavia la leen y escriben
-- activamente (marcarPedidoFiado, registrarAbonoFiado, upsertFiado).
-- Ver clasificacion en la documentacion.
-- ============================================================

create table if not exists public.fiados (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id),
  cliente_id uuid not null references public.clientes(id),
  monto_pendiente integer not null,
  estado text not null default 'PENDIENTE',
  fecha_fiado timestamptz not null default now(),
  fecha_pago_fiado timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fiados_monto_pendiente_check check (monto_pendiente >= 0),
  constraint fiados_estado_check check (estado in ('PENDIENTE', 'PAGADO'))
);

create index if not exists fiados_pedido_id_idx on public.fiados (pedido_id);
create index if not exists fiados_cliente_id_idx on public.fiados (cliente_id);
create index if not exists fiados_estado_idx on public.fiados (estado);

-- ============================================================
-- Mantenimiento administrativo: bitacora y tablas de archivo.
-- Usadas por services/adminMaintenanceService.ts (RPC admin_cerrar_mes_operativo
-- y admin_limpiar_datos_prueba) cuando Supabase esta configurado.
-- ============================================================

create table if not exists public.operaciones_admin_log (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,
  periodo text not null,
  ejecutado_por_email text not null,
  ejecutado_por_nombre text,
  resumen jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint operaciones_admin_log_tipo_check check (
    tipo in ('CIERRE_MENSUAL', 'LIMPIEZA_PRELANZAMIENTO')
  )
);

create table if not exists public.archivo_clientes (
  id uuid primary key default gen_random_uuid(),
  operacion_id uuid not null references public.operaciones_admin_log(id),
  original_cliente_id uuid,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.archivo_pedidos (
  id uuid primary key default gen_random_uuid(),
  operacion_id uuid not null references public.operaciones_admin_log(id),
  original_pedido_id uuid,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.archivo_pedido_items (
  id uuid primary key default gen_random_uuid(),
  operacion_id uuid not null references public.operaciones_admin_log(id),
  original_pedido_item_id uuid,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.archivo_pagos (
  id uuid primary key default gen_random_uuid(),
  operacion_id uuid not null references public.operaciones_admin_log(id),
  original_pago_id uuid,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.archivo_fiados (
  id uuid primary key default gen_random_uuid(),
  operacion_id uuid not null references public.operaciones_admin_log(id),
  original_fiado_id uuid,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- PWA / Web Push admin (badge del icono y suscripciones push).
-- Usadas por app/api/admin/badge-settings, app/api/admin/push-subscriptions,
-- app/api/admin/push/test y lib/pwa/sendWebPush.ts.
-- ============================================================

create table if not exists public.user_device_badge_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  device_label text,
  badge_enabled boolean not null default false,
  badge_supported boolean not null default false,
  notification_permission text,
  running_as_pwa boolean,
  last_badge_count integer not null default 0,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists user_device_badge_settings_user_device_idx
  on public.user_device_badge_settings (user_id, device_id);

create table if not exists public.admin_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  device_label text,
  notification_permission text,
  running_as_pwa boolean,
  is_active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists admin_push_subscriptions_user_device_endpoint_idx
  on public.admin_push_subscriptions (user_id, device_id, endpoint);

create index if not exists admin_push_subscriptions_is_active_idx
  on public.admin_push_subscriptions (is_active);

-- ============================================================
-- Triggers updated_at
-- ============================================================

drop trigger if exists usuarios_admin_set_updated_at on public.usuarios_admin;
create trigger usuarios_admin_set_updated_at
before update on public.usuarios_admin
for each row execute function public.set_updated_at();

drop trigger if exists clientes_set_updated_at on public.clientes;
create trigger clientes_set_updated_at
before update on public.clientes
for each row execute function public.set_updated_at();

drop trigger if exists productos_set_updated_at on public.productos;
create trigger productos_set_updated_at
before update on public.productos
for each row execute function public.set_updated_at();

drop trigger if exists business_settings_set_updated_at on public.business_settings;
create trigger business_settings_set_updated_at
before update on public.business_settings
for each row execute function public.set_updated_at();

drop trigger if exists pedidos_set_updated_at on public.pedidos;
create trigger pedidos_set_updated_at
before update on public.pedidos
for each row execute function public.set_updated_at();

drop trigger if exists fiados_set_updated_at on public.fiados;
create trigger fiados_set_updated_at
before update on public.fiados
for each row execute function public.set_updated_at();

drop trigger if exists user_device_badge_settings_set_updated_at on public.user_device_badge_settings;
create trigger user_device_badge_settings_set_updated_at
before update on public.user_device_badge_settings
for each row execute function public.set_updated_at();

drop trigger if exists admin_push_subscriptions_set_updated_at on public.admin_push_subscriptions;
create trigger admin_push_subscriptions_set_updated_at
before update on public.admin_push_subscriptions
for each row execute function public.set_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.usuarios_admin enable row level security;
alter table public.clientes enable row level security;
alter table public.productos enable row level security;
alter table public.business_settings enable row level security;
alter table public.pedidos enable row level security;
alter table public.pedido_items enable row level security;
alter table public.pagos enable row level security;
alter table public.fiados enable row level security;
alter table public.operaciones_admin_log enable row level security;
alter table public.archivo_clientes enable row level security;
alter table public.archivo_pedidos enable row level security;
alter table public.archivo_pedido_items enable row level security;
alter table public.archivo_pagos enable row level security;
alter table public.archivo_fiados enable row level security;
alter table public.user_device_badge_settings enable row level security;
alter table public.admin_push_subscriptions enable row level security;

-- usuarios_admin: cada admin solo puede leer su propio registro activo.
drop policy if exists "admin_can_read_own_profile" on public.usuarios_admin;
create policy "admin_can_read_own_profile"
on public.usuarios_admin
for select
to authenticated
using (email = auth.email() and activo = true);

-- productos: lectura publica solo de productos activos; admin gestiona todo.
drop policy if exists "public_can_read_active_products" on public.productos;
create policy "public_can_read_active_products"
on public.productos
for select
using (activo = true);

drop policy if exists "admin_can_manage_productos" on public.productos;
create policy "admin_can_manage_productos"
on public.productos
for all
to authenticated
using (public.is_active_admin())
with check (public.is_active_admin());

-- clientes: sin lectura ni escritura publica. Los inserts/updates desde la
-- aplicacion se hacen hoy con el cliente servidor (clave privilegiada), que
-- ignora RLS. Solo se habilita lectura para administradores autenticados.
drop policy if exists "admin_can_read_clientes" on public.clientes;
create policy "admin_can_read_clientes"
on public.clientes
for select
to authenticated
using (public.is_active_admin());

-- business_settings: nunca publico (contiene datos bancarios). Solo admin.
drop policy if exists "admin_can_manage_business_settings" on public.business_settings;
create policy "admin_can_manage_business_settings"
on public.business_settings
for all
to authenticated
using (public.is_active_admin())
with check (public.is_active_admin());

-- pedidos: sin politica publica de insercion ni lectura en esta fase. La
-- creacion publica de pedidos debe resolverse mas adelante mediante una
-- ruta de servidor segura o una RPC SECURITY DEFINER validada, no con una
-- politica RLS abierta. Admin gestiona todo.
drop policy if exists "admin_can_manage_pedidos" on public.pedidos;
create policy "admin_can_manage_pedidos"
on public.pedidos
for all
to authenticated
using (public.is_active_admin())
with check (public.is_active_admin());

-- pedido_items: solo lectura admin (misma asimetria que en Pauli Store:
-- las escrituras se hacen con el cliente servidor, no via Data API).
drop policy if exists "admin_can_read_pedido_items" on public.pedido_items;
create policy "admin_can_read_pedido_items"
on public.pedido_items
for select
to authenticated
using (public.is_active_admin());

-- pagos: gestion completa solo para admin.
drop policy if exists "admin_can_manage_pagos" on public.pagos;
create policy "admin_can_manage_pagos"
on public.pagos
for all
to authenticated
using (public.is_active_admin())
with check (public.is_active_admin());

-- fiados: gestion completa solo para admin.
drop policy if exists "admin_can_manage_fiados" on public.fiados;
create policy "admin_can_manage_fiados"
on public.fiados
for all
to authenticated
using (public.is_active_admin())
with check (public.is_active_admin());

-- Mantenimiento administrativo: solo lectura para admin. Las escrituras las
-- hacen las funciones SECURITY DEFINER de mas abajo.
drop policy if exists "admin_can_read_operaciones_admin_log" on public.operaciones_admin_log;
create policy "admin_can_read_operaciones_admin_log"
on public.operaciones_admin_log
for select
to authenticated
using (public.is_active_admin());

drop policy if exists "admin_can_read_archivo_clientes" on public.archivo_clientes;
create policy "admin_can_read_archivo_clientes"
on public.archivo_clientes
for select
to authenticated
using (public.is_active_admin());

drop policy if exists "admin_can_read_archivo_pedidos" on public.archivo_pedidos;
create policy "admin_can_read_archivo_pedidos"
on public.archivo_pedidos
for select
to authenticated
using (public.is_active_admin());

drop policy if exists "admin_can_read_archivo_pedido_items" on public.archivo_pedido_items;
create policy "admin_can_read_archivo_pedido_items"
on public.archivo_pedido_items
for select
to authenticated
using (public.is_active_admin());

drop policy if exists "admin_can_read_archivo_pagos" on public.archivo_pagos;
create policy "admin_can_read_archivo_pagos"
on public.archivo_pagos
for select
to authenticated
using (public.is_active_admin());

drop policy if exists "admin_can_read_archivo_fiados" on public.archivo_fiados;
create policy "admin_can_read_archivo_fiados"
on public.archivo_fiados
for select
to authenticated
using (public.is_active_admin());

-- Badge/push: cada usuario administra solo sus propios dispositivos, y debe
-- ademas ser un admin activo.
drop policy if exists "admin_can_manage_own_badge_settings" on public.user_device_badge_settings;
create policy "admin_can_manage_own_badge_settings"
on public.user_device_badge_settings
for all
to authenticated
using (user_id = auth.uid() and public.is_active_admin())
with check (user_id = auth.uid() and public.is_active_admin());

drop policy if exists "admin_can_manage_own_push_subscriptions" on public.admin_push_subscriptions;
create policy "admin_can_manage_own_push_subscriptions"
on public.admin_push_subscriptions
for all
to authenticated
using (user_id = auth.uid() and public.is_active_admin())
with check (user_id = auth.uid() and public.is_active_admin());

-- ============================================================
-- Funciones administrativas SECURITY DEFINER (cierre mensual y limpieza
-- de datos de prueba). Adaptadas al nuevo estado de pedidos: un pedido se
-- considera "abierto" si no esta en ENTREGADO ni CANCELADO.
-- Solo ejecutables por service_role (llamadas desde
-- services/adminMaintenanceService.ts con el cliente servidor).
-- ============================================================

create or replace function public.admin_cerrar_mes_operativo(
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
  v_abiertos integer := 0;
  v_resumen jsonb;
begin
  select count(*) into v_abiertos
  from pedidos
  where estado_pedido not in ('ENTREGADO', 'CANCELADO');

  if v_abiertos > 0 then
    raise exception 'No se puede cerrar el mes mientras existan pedidos abiertos (no entregados ni cancelados).';
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
    id, tipo, periodo, ejecutado_por_email, ejecutado_por_nombre, resumen
  ) values (
    v_operacion_id, 'CIERRE_MENSUAL', v_periodo, p_admin_email, p_admin_nombre, v_resumen
  );

  insert into archivo_clientes (operacion_id, original_cliente_id, payload)
  select v_operacion_id, c.id, to_jsonb(c) from clientes c;

  insert into archivo_pedidos (operacion_id, original_pedido_id, payload)
  select v_operacion_id, p.id, to_jsonb(p) from pedidos p;

  insert into archivo_pedido_items (operacion_id, original_pedido_item_id, payload)
  select v_operacion_id, pi.id, to_jsonb(pi) from pedido_items pi;

  insert into archivo_pagos (operacion_id, original_pago_id, payload)
  select v_operacion_id, pa.id, to_jsonb(pa) from pagos pa;

  insert into archivo_fiados (operacion_id, original_fiado_id, payload)
  select v_operacion_id, f.id, to_jsonb(f) from fiados f;

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

create or replace function public.admin_limpiar_datos_prueba(
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
    id, tipo, periodo, ejecutado_por_email, ejecutado_por_nombre, resumen
  ) values (
    v_operacion_id, 'LIMPIEZA_PRELANZAMIENTO', v_periodo, p_admin_email, p_admin_nombre, v_resumen
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

revoke all on function public.admin_cerrar_mes_operativo(text, text) from public;
revoke all on function public.admin_cerrar_mes_operativo(text, text) from anon;
revoke all on function public.admin_cerrar_mes_operativo(text, text) from authenticated;
grant execute on function public.admin_cerrar_mes_operativo(text, text) to service_role;

revoke all on function public.admin_limpiar_datos_prueba(text, text) from public;
revoke all on function public.admin_limpiar_datos_prueba(text, text) from anon;
revoke all on function public.admin_limpiar_datos_prueba(text, text) from authenticated;
grant execute on function public.admin_limpiar_datos_prueba(text, text) to service_role;
