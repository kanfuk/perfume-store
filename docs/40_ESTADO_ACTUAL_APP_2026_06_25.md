# 40 - Estado Actual App 2026-06-25

Este documento resume el estado vigente de **Pauli Store** despues de la pasada final de ajustes sobre admin, fiados, venta directa, WhatsApp y catalogo publico.

## Estado general

- Produccion y rama `main` alineadas al cierre del dia
- Cliente publico operativo
- Admin operativo con Supabase Auth
- Venta directa y pedido personalizado funcionando con seleccion de clientes existentes
- Fiados agrupados por cliente en la vista de cobros
- Mensajes de cobro por WhatsApp unificados entre cobro individual y consolidado

## Cambios activos al 2026-06-25

### Ventas y fiados

- los fiados se agrupan por cliente antes de renderizar
- si hay registros del mismo cliente con datos incompletos, la vista prioriza nombre, telefono y lugar de trabajo mas completos
- el detalle por cliente muestra cada pedido fiado con fecha, items y saldo
- el boton `Cobrar por WhatsApp` funciona a nivel cliente agrupado

### Pedidos por atender

El contador visible en admin ahora considera como pendientes de atencion solo pedidos que:

- siguen en estado operativo no cerrado
- no estan `AGENDADO`
- no estan `FINALIZADO`
- no estan `CANCELADO`
- no tienen `admin_seen = true`
- no tienen `fecha_agendado`

### Venta directa y pedido personalizado

- venta directa desde catalogo con busqueda predictiva de clientes existentes
- pedido personalizado con buscador y `select` de clientes existentes
- pedidos personalizados pueden asociarse al `cliente_id` existente en vez de crear duplicados
- fecha de entrega del pedido personalizado con selector nativo y accion rapida `Hoy`

### Reasociacion de cliente al dejar fiado

- cuando un pedido agendado se deja fiado, el servicio intenta enlazarlo al cliente existente mas completo si el registro original quedo incompleto
- esto ayuda especialmente con pedidos manuales o personalizados creados antes de los ajustes de asociacion

### WhatsApp de cobro

- mensaje individual y consolidado comparten estructura
- ambos incluyen nombre del cliente, total, detalle y datos de transferencia
- se ajusto la generacion del texto para evitar caracteres corruptos en WhatsApp Web

### Catalogo publico

- la descripcion de producto tiene lectura mas prolija en mobile
- se mantiene `Ver mas / Ver menos`
- el estilo de descripcion queda aislado al texto del producto

## Higiene del repo

- `README.md` y documentacion principal actualizados al estado vigente
- indice documental alineado con el archivo de estado actual
- documentacion historica mantenida como contexto, no como fuente de verdad
- artefactos generados locales pueden limpiarse sin afectar el repo (`.next/`, `coverage/`, etc.)

## Validacion local ejecutada

- `npm run build`
- `npm run lint`

## Fuente de verdad para continuar

Si mañana se retoma el proyecto, leer en este orden:

1. `README.md`
2. `docs/00_INDICE_DOCUMENTACION.md`
3. `docs/40_ESTADO_ACTUAL_APP_2026_06_25.md`

Los documentos `38` y `39` quedan como referencia historica inmediata de la etapa previa.
