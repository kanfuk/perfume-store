create or replace function public.normalize_customer_merge_name(value text)
returns text
language sql
immutable
as $$
  select regexp_replace(
    translate(lower(trim(coalesce(value, ''))), 'áéíóúäëïöüñ', 'aeiouaeioun'),
    '\s+',
    ' ',
    'g'
  );
$$;

create or replace function public.customer_merge_data_score(phone text, workplace text)
returns integer
language sql
immutable
as $$
  select
    (case when coalesce(trim(phone), '') <> '' then 4 else 0 end) +
    (case
      when public.normalize_customer_merge_name(workplace) in (
        '',
        'venta directa',
        'venta whatsapp manual',
        'pedido personalizado'
      ) then 0
      else 2
    end) +
    (case when coalesce(trim(workplace), '') <> '' then 1 else 0 end);
$$;

create or replace function public.merge_customer_variants(
  aliases text[],
  canonical_name text
)
returns void
language plpgsql
as $$
declare
  canonical_id uuid;
  canonical_phone text;
  canonical_workplace text;
begin
  select c.id, c.telefono, c.lugar_trabajo
  into canonical_id, canonical_phone, canonical_workplace
  from public.clientes c
  where public.normalize_customer_merge_name(c.nombre) = any (
    select public.normalize_customer_merge_name(alias_name)
    from unnest(aliases) as alias_name
  )
  order by
    (case
      when public.normalize_customer_merge_name(c.nombre) =
        public.normalize_customer_merge_name(canonical_name) then 1
      else 0
    end) desc,
    public.customer_merge_data_score(c.telefono, c.lugar_trabajo) desc,
    c.id
  limit 1;

  if canonical_id is null then
    insert into public.clientes (nombre, telefono, lugar_trabajo)
    values (canonical_name, null, '')
    returning id, telefono, lugar_trabajo
    into canonical_id, canonical_phone, canonical_workplace;
  end if;

  select
    coalesce(
      (
        select c.telefono
        from public.clientes c
        where public.normalize_customer_merge_name(c.nombre) = any (
          select public.normalize_customer_merge_name(alias_name)
          from unnest(aliases) as alias_name
        )
          and coalesce(trim(c.telefono), '') <> ''
        order by public.customer_merge_data_score(c.telefono, c.lugar_trabajo) desc, c.id
        limit 1
      ),
      canonical_phone
    ),
    coalesce(
      (
        select c.lugar_trabajo
        from public.clientes c
        where public.normalize_customer_merge_name(c.nombre) = any (
          select public.normalize_customer_merge_name(alias_name)
          from unnest(aliases) as alias_name
        )
          and public.normalize_customer_merge_name(c.lugar_trabajo) not in (
            '',
            'venta directa',
            'venta whatsapp manual',
            'pedido personalizado'
          )
        order by public.customer_merge_data_score(c.telefono, c.lugar_trabajo) desc, c.id
        limit 1
      ),
      canonical_workplace,
      ''
    )
  into canonical_phone, canonical_workplace;

  update public.clientes
  set
    nombre = canonical_name,
    telefono = nullif(canonical_phone, ''),
    lugar_trabajo = canonical_workplace
  where id = canonical_id;

  update public.pedidos
  set cliente_id = canonical_id
  where cliente_id in (
    select c.id
    from public.clientes c
    where public.normalize_customer_merge_name(c.nombre) = any (
      select public.normalize_customer_merge_name(alias_name)
      from unnest(aliases) as alias_name
    )
      and c.id <> canonical_id
  );

  update public.fiados
  set cliente_id = canonical_id
  where cliente_id in (
    select c.id
    from public.clientes c
    where public.normalize_customer_merge_name(c.nombre) = any (
      select public.normalize_customer_merge_name(alias_name)
      from unnest(aliases) as alias_name
    )
      and c.id <> canonical_id
  );

  delete from public.clientes c
  where public.normalize_customer_merge_name(c.nombre) = any (
    select public.normalize_customer_merge_name(alias_name)
    from unnest(aliases) as alias_name
  )
    and c.id <> canonical_id
    and not exists (
      select 1
      from public.pedidos p
      where p.cliente_id = c.id
    )
    and not exists (
      select 1
      from public.fiados f
      where f.cliente_id = c.id
    );
end;
$$;

select public.merge_customer_variants(
  array['paty', 'Patricia Diaz'],
  'Patricia Diaz'
);

select public.merge_customer_variants(
  array['Loreto Looez', 'Loreto Lopez'],
  'Loreto Lopez'
);

select public.merge_customer_variants(
  array['yo', 'cliente ocasional', 'Pauli'],
  'Pauli'
);

select public.merge_customer_variants(
  array['camila montes', 'Camila Montes'],
  'Camila Montes'
);

drop function if exists public.merge_customer_variants(text[], text);
drop function if exists public.customer_merge_data_score(text, text);
drop function if exists public.normalize_customer_merge_name(text);
