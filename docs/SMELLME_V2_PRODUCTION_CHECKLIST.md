# Smellme.cl 2.0.0 — checklist de producción

## Antes del release

- [ ] Rama `release/v2.0.0` parte de `d69263ff6bdfa90bc564d245c0c0e3493675affe`.
- [ ] `main` local/remota permanece en `65fc1755b17bc5b66c026114b4dc87922a027aab`.
- [ ] Working tree limpio y un único worktree.
- [ ] `npm ci`, lint, typecheck, pruebas y build correctos.
- [ ] `npm audit --production` en cero.
- [ ] DB lint sin diagnósticos nuevos y dry-run sin migraciones pendientes.
- [ ] Supabase `nxgkudvrotlaqvvhygem` y Storage continúan en cero.
- [ ] Auth, admin, business settings, banco, WhatsApp y branding preservados.
- [ ] Preview de release `READY` y smoke sin respuestas 500.

## Git y tag

- [ ] Crear el commit `chore(release): prepare Smellme v2.0.0` y publicarlo.
- [ ] Integrar a `main` con fast-forward.
- [ ] Repetir lint, typecheck, pruebas y build desde `main`.
- [ ] Publicar `main` sin force push.
- [ ] Crear y publicar el tag anotado `v2.0.0` en el mismo commit de `main`.

## Despliegue

- [ ] Ejecutar `npx vercel --prod` desde `main` limpio y etiquetado.
- [ ] Confirmar target `production`, estado `READY` y alias
  `https://perfume-store-mu-smoky.vercel.app/` o el alias productivo vigente informado por Vercel.
- [ ] Confirmar que el deployment corresponde al commit de `main`/`v2.0.0`.
- [ ] No imprimir variables ni credenciales.

## Smoke público

- [ ] `/` responde 200 y presenta el catálogo vacío de forma amigable.
- [ ] `/api/products` responde 200 con colección vacía.
- [ ] Assets principales responden 200.
- [ ] No aparecen referencias a Preview, localhost ni Brave.
- [ ] “Compartir mi tiendita” resuelve la raíz productiva, sin `/admin`, login o parámetros.

## Smoke administrativo sin sesión

- [ ] `/admin/login` responde 200.
- [ ] `/admin`, `/admin/pedidos` y `/admin/mantenimiento` redirigen 307.
- [ ] APIs administrativas responden 401/405.
- [ ] No hay respuestas 500.

## Smoke administrativo autenticado

- [ ] Login y dashboard disponibles usando credenciales seguras existentes.
- [ ] Productos, pedidos, clientes y reportes muestran cero.
- [ ] Banco completo y WhatsApp configurado se comprueban sólo mediante booleanos.
- [ ] Importador, carga manual y mantenimiento están disponibles.
- [ ] La interfaz informa versión 2.0.0.
- [ ] No se crea una venta real ni registros persistentes de QA.

## Cierre

- [ ] Repetir preview operacional y comprobación de Storage en cero.
- [ ] Confirmar que no existe ningún registro `ZZTEST`.
- [ ] Confirmar `main`, `origin/main` y `v2.0.0^{commit}` en el mismo commit.
- [ ] Ejecutar `git fsck --full`, revisar un único worktree y árbol limpio.

## Limitación aceptada

No se realizó una prueba desde teléfono físico. El release fue aceptado con automatización,
integración, emulación iPhone/Safari, emulación Android/Chrome y revisión visual del Preview.

## Rollback

Ante un fallo del smoke, no tocar datos ni reescribir Git. Promover el deployment anterior
`dpl_AqmHo9HqbffEznRMZ7LWE7QjTeea`, conservar `v2.0.0`, registrar el incidente y detenerse.
