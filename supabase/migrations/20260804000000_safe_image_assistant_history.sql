-- Historial mínimo, idempotente y auditable del asistente seguro de imágenes.
-- No almacena secretos ni datos bancarios.
create table if not exists public.product_image_assistant_attempts (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.productos(id) on delete cascade,
  source_url text not null,
  normalized_source_url text not null,
  source_domain text not null,
  source_sha256 text,
  score integer not null check (score between 0 and 100),
  reasons jsonb not null default '[]'::jsonb,
  status text not null check (status in ('PROCESSING', 'APPLIED', 'ERROR')),
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (product_id, normalized_source_url)
);

create unique index if not exists product_image_assistant_applied_hash_uidx
  on public.product_image_assistant_attempts (source_sha256)
  where status = 'APPLIED' and source_sha256 is not null;

alter table public.product_image_assistant_attempts enable row level security;
revoke all on table public.product_image_assistant_attempts from anon, authenticated;
grant select, insert, update on table public.product_image_assistant_attempts to service_role;
