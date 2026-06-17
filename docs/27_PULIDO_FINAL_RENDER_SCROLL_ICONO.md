# 27 - Pulido final render, scroll e icono

## Resumen

La base de scroll y render sigue apoyada en:

- control global de `overflow-x`
- `min-w-0` en zonas criticas
- wrappers con `max-w-full`
- carrito movil con safe-area

## Seguimiento posterior

La ruta nueva `/admin/venta-directa` se implemento sin tablas anchas y reutilizando las cards del flujo cliente para reducir riesgo de overflow horizontal.

## QA recomendado

- revisar `/`
- revisar `/#hacer-pedido`
- revisar `/admin/reportes`
- revisar `/admin/venta-directa`
- validar en 360px y 390px con telefono real
