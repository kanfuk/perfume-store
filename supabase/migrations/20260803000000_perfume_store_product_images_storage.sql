-- Perfume Store
-- Fase 3B.3: bucket de Supabase Storage para fotos de producto subidas por
-- el admin.
--
-- Motivo: no existia ningun bucket de Storage en el proyecto. El flujo
-- "Asignar imagen" (app/api/admin/products/[productId]/image/route.ts)
-- solo guardaba una URL de texto en productos.image_url, sin subir ni
-- procesar ningun archivo. Esta migracion crea el bucket publico de solo
-- lectura donde el servidor sube las fotos ya procesadas (WebP, mismo
-- estandar que public/images/perfumes/top12/*.webp).
--
-- Publico de lectura porque el catalogo publico necesita mostrar las fotos
-- sin sesion (igual que el resto de las imagenes del catalogo). Escritura
-- (insert/update/delete) queda acotada a service_role: el navegador nunca
-- sube ni borra directo a Storage, siempre pasa por la API administrativa.
--
-- No contiene datos reales de clientes, pedidos, productos ni credenciales.
-- No modifica ninguna tabla ni RPC existente: es aditiva.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 10485760, array['image/webp'])
on conflict (id) do nothing;

create policy "product_images_public_read"
on storage.objects for select
to public
using (bucket_id = 'product-images');

create policy "product_images_service_role_insert"
on storage.objects for insert
to service_role
with check (bucket_id = 'product-images');

create policy "product_images_service_role_update"
on storage.objects for update
to service_role
using (bucket_id = 'product-images')
with check (bucket_id = 'product-images');

create policy "product_images_service_role_delete"
on storage.objects for delete
to service_role
using (bucket_id = 'product-images');
