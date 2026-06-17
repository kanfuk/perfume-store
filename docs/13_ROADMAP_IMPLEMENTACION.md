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

Estado: completada para MVP

- home cliente publica
- carrito rapido
- formulario simplificado
- validacion de celular chileno
- clientes frecuentes guardados localmente
- fallback visual de imagen
- scroll movil estable
- wrappers reforzados para evitar micro-overflow en movil

Pendiente:

- microcopia final
- QA visual en mas dispositivos reales

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

Estado: funcional con pulido responsive final

- login admin con Supabase Auth
- validacion de admin activo
- pendientes, agendados e historial
- gestion basica de productos y pedidos
- rutas separadas para pedidos, stock, ventas, clientes y reportes
- ajuste para evitar desajuste de fecha entre servidor y cliente
- filtros de reportes reforzados para 360px

Pendiente:

- dashboards mas visuales
- separacion mas fuerte entre stock, cobros y reportes

### Fase 7 - Pagados y fiados

Estado: parcial funcional

- estructura de datos lista
- acciones basicas disponibles
- vistas dedicadas ya separadas

Pendiente:

- mejor flujo para revisar deuda historica

### Fase 8 - Reportes

Estado: funcional base

- reportes por rango de fechas
- resumen general
- cierre mensual operativo
- limpieza pre-lanzamiento de data simulada

Pendiente:

- ranking de productos
- visualizaciones livianas si aportan claridad

### Fase 9 - Seguridad y QA

Estado: en curso

Ya cubierto:

- headers base
- RLS principal
- `security.txt`
- correcciones de auditoria
- typecheck, lint y build estables
- revision final de scroll, render e iconografia
- herramientas de mantenimiento operativo en admin

Pendiente:

- CSP con nonce
- regresion QA final movil y escritorio en produccion

### Fase 10 - Deploy MVP

Estado: publicado

- app en Vercel
- Supabase conectado
- flujo cliente y admin operativos
- iconos nativos en `app/` listos para cache nuevo

Pendiente:

- revisar dominio final definitivo
- checklist final de salida
