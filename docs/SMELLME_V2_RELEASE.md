# Smellme.cl 2.0.0 — release estable

## Identidad y alcance

- Versión: `2.0.0`.
- Rama de preparación: `release/v2.0.0`.
- Tag inmutable: `v2.0.0`.
- Producción: `https://perfume-store-mu-smoky.vercel.app/`.
- Proyecto Supabase: `nxgkudvrotlaqvvhygem`.
- Estado inicial: catálogo, pedidos, clientes, ventas, pagos, stock, imágenes y reportes en cero.

La versión estable incluye catálogo e importación CSV, Top 12, ofertas, tienda pública
mobile-first, pedidos públicos, venta directa, pedidos personalizados, clientes, stock
transaccional, pagos, preparación, despacho, entrega, reportes, configuración bancaria,
WhatsApp móvil, carga manual de imágenes y mantenimiento protegido.

## Arquitectura operativa

La aplicación usa Next.js App Router y React, con reglas de negocio separadas en servicios y
repositorios. Supabase aporta Auth, Postgres y el bucket privado `product-images`; Vercel ejecuta
el frontend y las rutas servidor. Las mutaciones sensibles permanecen en APIs/RPC protegidas.

Las imágenes se cargan manualmente, se validan como JPEG/PNG/WebP y Sharp las autorrota,
redimensiona sin deformar ni ampliar por sobre 1600 px y convierte a WebP. WhatsApp usa un helper
único para normalizar destinatarios y mensajes. Las mutaciones administrativas terminan antes de
mostrar un CTA explícito; la navegación externa sólo ocurre por un gesto nuevo del usuario.

## Seguridad de dependencias

Cambios controlados del release:

| Paquete | Antes | 2.0.0 | Motivo |
|---|---:|---:|---|
| Next.js | 16.2.9 | 16.2.12 | Último parche estable 16.x y correcciones coordinadas de seguridad. |
| eslint-config-next | 16.2.9 | 16.2.12 | Mantener alineación con el framework. |
| Sharp | 0.34.5 | 0.35.3 | Corregir vulnerabilidades heredadas de libvips. |
| PostCSS | 8.5.15 / 8.4.31 anidado | 8.5.25 | Corregir XSS y lectura/path traversal de source maps. |

Next 16.2.12 todavía declara internamente PostCSS 8.4.31 y Sharp `^0.34.5`. Como no existe una
versión estable posterior compatible en la línea 16.x, `package.json` usa overrides acotados que
los deduplican a las versiones directas verificadas. No se actualizaron React ni paquetes ajenos.

Se corrigieron los advisories de Next.js detectados por npm (`GHSA-6gpp-xcg3-4w24`,
`GHSA-m99w-x7hq-7vfj`, `GHSA-89xv-2m56-2m9x`, `GHSA-68g3-v927-f742`,
`GHSA-4633-3j49-mh5q`, `GHSA-4c39-4ccg-62r3`, `GHSA-p9j2-gv94-2wf4`,
`GHSA-q8wf-6r8g-63ch`, `GHSA-955p-x3mx-jcvp`), PostCSS (`GHSA-qx2v-qp2m-jg93`,
`GHSA-6g55-p6wh-862q`, `GHSA-r28c-9q8g-f849`) y Sharp/libvips
(`GHSA-f88m-g3jw-g9cj`). `npm audit --production` termina sin vulnerabilidades conocidas.

El audit completo de herramientas de desarrollo conserva dos familias altas transitivas:
`brace-expansion` (`GHSA-3jxr-9vmj-r5cp`, `GHSA-mh99-v99m-4gvg`) y `js-yaml`
(`GHSA-52cp-r559-cp3m`). No pertenecen al árbol productivo ni se ejecutan en rutas de la
aplicación; llegan desde tooling de lint/TypeScript. Se documentan sin ampliar este release a una
actualización mayor o no relacionada. La puerta de producción exigida usa el árbol `--production`
y queda en cero.

## Validación y limitación móvil

La aceptación incluye pruebas unitarias y de integración, build productivo, emulación equivalente
a iPhone/Safari y Android/Chrome y revisión responsive del Preview. No se realizó una prueba en
un teléfono físico y la documentación no debe interpretarse como si hubiese ocurrido.

La regresión de Sharp cubre JPEG, PNG, WebP, EXIF, transparencia, calidad, máximo de 1600 px,
proporción, entrada inválida, reemplazo, eliminación y rollback. La regresión de WhatsApp confirma
que no existen `about:blank`, popups posteriores a `await` ni aperturas desde `useEffect`, y que
el enlace de “Compartir mi tiendita” usa el origen actual sin rutas administrativas.

## Datos y configuración preservada

El release no ejecuta seeds ni crea registros comerciales. La verificación remota debe mantener
en cero productos, pedidos, detalles, clientes, pagos, fiados, stock, reservas, movimientos,
importaciones, imágenes, Storage y reportes. Auth, administrador, `business_settings`, banco,
WhatsApp y branding permanecen preservados.

## Despliegue y verificación

El procedimiento obligatorio es: Preview desde la rama de release, commit único, fast-forward a
`main`, tag anotado `v2.0.0`, despliegue Vercel productivo y smoke público/administrativo sin crear
ventas. El detalle ejecutable está en `SMELLME_V2_PRODUCTION_CHECKLIST.md`.

## Rollback

- Commit de `main` anterior al release: `65fc1755b17bc5b66c026114b4dc87922a027aab`.
- Deployment productivo anterior: `dpl_AqmHo9HqbffEznRMZ7LWE7QjTeea`.
- Deployment anterior recuperable: `perfume-store-kkkl2lt04-kanfuk-s-projects.vercel.app`.
- Commit nuevo: el commit al que apunta `v2.0.0`.
- Migraciones de cierre ya aplicadas: `20260806000000_smellme_full_operational_reset.sql` y
  `20260806010000_smellme_full_operational_reset_safeupdate.sql`.
- Fase 6 no agrega migraciones; los cambios de aplicación son compatibles hacia atrás.

Si el smoke productivo falla, no se deben modificar datos ni mover/eliminar el tag. Se debe
promover el deployment anterior en Vercel, registrar la incidencia y detener la operación.

## Operación inicial del cliente

1. Ingresar al panel con la cuenta administrativa existente.
2. Confirmar banco y WhatsApp sin exponer sus valores.
3. Importar o crear el catálogo comercial real.
4. Revisar costo, precio, stock, Top 12, oferta e imagen antes de activar cada producto.
5. Verificar el home público y recién entonces aceptar el primer pedido comercial.
6. Usar mantenimiento sólo con preview, respaldo y confirmación exacta.
