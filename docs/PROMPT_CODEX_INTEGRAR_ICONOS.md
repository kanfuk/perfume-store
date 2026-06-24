# Prompt para Codex - Integrar favicon e iconos Pauli Store

Integra el pack de favicon e iconos de Pauli Store al proyecto Next.js.

Tareas:
1. Copiar `app/favicon.ico`, `app/icon.png` y `app/apple-icon.png` en la carpeta `app/`.
2. Copiar `public/favicon.ico`, `public/site.webmanifest` y `public/icons/` en la carpeta `public/`.
3. Revisar `app/layout.tsx` y actualizar metadata sin duplicar configuración existente:
   - title: "Pauli Store"
   - description: "Pedidos caseros de Pauli Store"
   - icons.icon: "/favicon.ico"
   - icons.apple: "/icons/apple-touch-icon.png"
   - manifest: "/site.webmanifest"
   - themeColor: "#B87533"
4. No cambiar lógica de negocio.
5. No cambiar rutas.
6. No cambiar Supabase.
7. Ejecutar:
   - npm run typecheck
   - npm run lint
   - npm run build
8. Hacer commit:
   git add .
   git commit -m "Agrega favicon e iconos Pauli Store"
   git push

Verificar después del deploy:
- /favicon.ico?v=99
- /icons/apple-touch-icon.png?v=99
- /icons/android-chrome-192x192.png?v=99
- /site.webmanifest?v=99
