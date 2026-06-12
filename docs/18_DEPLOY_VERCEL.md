# 18 - Deploy en Vercel

## Objetivo

Publicar una primera version funcional de Pauli Store usando:

- frontend y backend en Vercel
- base de datos y auth en Supabase

## Estado previo esperado

Antes de desplegar, debe estar listo:

- Supabase conectado
- productos cargados
- pedido real guardando en base
- login admin funcionando con Supabase Auth

## Variables de entorno en Vercel

Agregar en `Project Settings -> Environment Variables`:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SECRET_KEY
HORAS_EXPIRACION_PEDIDO=72
```

## Alcance recomendado

Agregar esas variables al menos en:

```text
Production
Preview
```

## Flujo recomendado

```text
1. Importar repo en Vercel
2. Confirmar framework Next.js
3. Cargar variables de entorno
4. Ejecutar primer deploy
5. Copiar la URL generada por Vercel
6. Ir a Supabase -> Authentication -> URL Configuration
7. Configurar Site URL con la URL de Vercel
8. Agregar la URL de Vercel a Redirect URLs si luego usamos enlaces por correo
9. Probar formulario publico
10. Probar login admin
11. Probar creacion de pedido
```

## Pruebas minimas post deploy

Verificar:

```text
Formulario cliente abre
Productos cargan desde Supabase
Pedido se registra
Admin puede iniciar sesion
Admin puede ver pedidos
```

## Riesgos comunes

- Variables mal copiadas.
- No actualizar `Site URL` en Supabase.
- Probar login por correo antes de ajustar redirects.
- Usar la secret key en frontend, lo cual no debe ocurrir.
