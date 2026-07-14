# Deployment

## Base actual

- framework: Next.js App Router
- datos: Supabase
- despliegue esperado: Vercel

## Checklist

1. Configurar variables de entorno publicas y privadas.
2. Verificar que las claves privadas no usen prefijo `NEXT_PUBLIC_`.
3. Ejecutar `npm run lint`, `npm run typecheck`, `npm run test:run` y `npm run build`.
4. Confirmar que las migraciones nuevas sean incrementales y compatibles.
5. Publicar y validar flujos cliente/admin.

## Post deploy

- validar login admin
- validar alta de pedido publico
- validar stock y venta directa
- validar badge/push si aplica PWA

## Nota

El build compila correctamente en este entorno local al cierre de esta pasada.
