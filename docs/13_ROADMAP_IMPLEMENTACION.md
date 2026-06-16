# 13 - Roadmap de implementacion

## Regla principal

No cerrar todo de una vez. Cada fase debe quedar funcional, probada y desplegable.

## Estado resumido por fases

### Fase 1 - Base del proyecto

Estado: completada

- estructura Next.js
- layout base
- docs iniciales
- estilos globales

### Fase 2 - Dominio y reglas

Estado: completada

- entidades base
- estados oficiales
- validadores y servicios

### Fase 3 - Flujo cliente

Estado: avanzada

- home cliente publica
- carrito rapido
- formulario simplificado
- validacion de celular chileno
- clientes frecuentes guardados localmente

Pendiente:

- microcopia final
- ultimo pulido visual fino

### Fase 4 - Supabase y modelo de datos

Estado: avanzada

- tablas principales
- RLS habilitado
- SQL base documentado
- productos, pedidos, pagos, fiados, admins

Pendiente:

- seguir alineando base productiva con el esquema versionado

### Fase 5 - Registro real de pedidos

Estado: completada en MVP

- cliente crea pedido real
- total se recalcula en backend
- no se expone logica sensible al navegador

### Fase 6 - Panel admin

Estado: funcional, no final

- login admin con Supabase Auth
- validacion de admin activo
- pendientes, agendados e historial
- gestion basica de productos y pedidos

Pendiente:

- UX mobile-first final
- dashboards mas visuales
- separacion fuerte entre stock, cobros y reportes

### Fase 7 - Pagados y fiados

Estado: parcial

- estructura de datos lista
- acciones basicas disponibles

Pendiente:

- vista dedicada de cobros
- mejor flujo para marcar y revisar deudas

### Fase 8 - Reportes

Estado: inicial

Pendiente:

- reportes por rango de fechas
- resumen de ventas y fiados
- ranking de productos

### Fase 9 - Seguridad y QA

Estado: en curso

Ya cubierto:

- headers base
- RLS principal
- `security.txt`
- correcciones de auditoria

Pendiente:

- CSP con nonce
- regresion QA final movil y escritorio

### Fase 10 - Deploy MVP

Estado: publicado

- app en Vercel
- Supabase conectado
- flujo cliente y admin operativos

Pendiente:

- revisar dominio final definitivo
- checklist final de salida
