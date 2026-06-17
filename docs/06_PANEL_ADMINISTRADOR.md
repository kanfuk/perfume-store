# 06 - Panel administrador

## Objetivo

Permitir que Pauli administre la tienda desde celular o PC sin enredarse con datos tecnicos.

La idea del panel no es mostrar "todo". La idea es mostrar lo necesario para decidir rapido:

- que hay que preparar hoy
- que pedidos hay que confirmar
- que cobros siguen pendientes
- que productos estan activos o sin stock

## Estado actual

Hoy el panel ya permite:

- login real con Supabase Auth
- filtro principal entre pendientes, agendados e historial
- cambio de estado de pedidos
- gestion basica de productos
- resumen superior con totales utiles

Todavia falta una pasada final mas fuerte de UX para dejarlo listo como herramienta diaria de Pauli.

## Ajustes responsive ya implementados

- rutas reales por modulo
- navbar movil inferior
- filtros y tarjetas con mejor control de ancho
- selector de fechas de reportes corregido para movil
- botones y badges mas consistentes
- control de overflow horizontal en vistas principales

## Estructura objetivo del panel

El panel debe girar alrededor de 5 vistas simples.

### 1. Inicio

Debe mostrar solo indicadores cortos:

- pedidos pendientes
- pedidos agendados para hoy
- total pagado del dia
- total fiado pendiente
- productos sin stock o desactivados

### 2. Pedidos

Debe concentrar:

- pendientes
- agendados
- historial

Cada tarjeta de pedido debe dejar muy claro:

- cliente
- telefono
- lugar
- fecha entrega
- hora o fecha de registro
- total
- estado pedido
- estado pago

### 3. Productos y stock

Debe permitir desde celular:

- crear producto
- editar nombre, descripcion y precio
- activar o desactivar producto
- ajustar stock actual
- ajustar stock disponible para agenda

### 4. Cobros

Vista separada para:

- pagados
- fiados
- saldo pendiente
- cambio rapido de estado

### 5. Reportes

Vista simple y util:

- ventas por rango de fechas
- pedidos finalizados
- monto pagado
- monto fiado
- productos mas vendidos

## Regla UX para admin

- una accion importante por boton
- texto corto
- nada de bloques enormes con datos secundarios
- tarjetas tactiles grandes
- filtros visibles
- jerarquia visual clara
- home rapido para volver siempre

## Prioridades pendientes del panel admin

1. Reordenar dashboard para que sea mas operativo y menos textual
2. Separar mejor stock, cobros y reportes
3. Mejorar uso desde celular en tablas y tarjetas
4. Hacer mas evidente la fecha de entrega y agrupacion por cliente/dia
5. Afinar acciones de pagos y fiados en una vista dedicada
