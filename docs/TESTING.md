# Testing

## Comandos

```bash
npm run lint
npm run typecheck
npm run test:run
npm run build
```

## Cobertura actual relevante

- validadores
- servicios de productos y pedidos
- flujo admin de pedidos
- calculos auxiliares de pendientes

## Enfoque recomendado

- priorizar reglas de negocio antes que snapshots
- agregar pruebas a costos manuales vs estimados
- cubrir permisos y validaciones de payload en rutas admin/public
- mantener regresion sobre stock, pagos y fiados

## Pruebas manuales importantes

- pedido publico desde celular
- agenda y cierre de pedidos en admin
- venta directa y pedido personalizado
- badge/PWA/push en iPhone instalado
