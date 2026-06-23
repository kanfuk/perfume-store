# 34 - Checklist QA WhatsApp confirmación de pedidos

## Objetivo

Validar que la integración de WhatsApp manual funcione sin romper Pauli Store y que quede preparada para modo automático futuro.

## 1. Validación técnica

Ejecutar:

```bash
npm run typecheck
npm run lint
npm run build
```

Resultado esperado:

- TypeScript sin errores.
- Lint sin errores críticos.
- Build exitoso.

## 2. Rutas a revisar

```txt
/
/#hacer-pedido
/admin
/admin/pedidos
/admin/clientes
/admin/stock
/admin/ventas
/admin/reportes
/admin/venta-directa
```

Resultado esperado:

- Todas cargan sin error.
- No se rompe navegación.
- No aparece navbar inferior antigua.
- Botón flotante WhatsApp/Home sigue visible y operativo.

## 3. Prueba pedido con teléfono válido

Pasos:

1. Crear un pedido con teléfono válido, ejemplo: `987654321`.
2. Confirmar pedido desde `/admin/pedidos`.
3. Verificar que aparezca botón `Enviar WhatsApp`.
4. Presionar botón.
5. Confirmar que abre WhatsApp con el número `56987654321`.
6. Confirmar que el mensaje se ve bien.

Resultado esperado:

- WhatsApp abre correctamente.
- Mensaje aparece prellenado.
- No se envía automáticamente.
- El estado del pedido no cambia solo por abrir el link.

## 4. Prueba pedido con teléfono en distintos formatos

Probar:

```txt
987654321
+56987654321
56987654321
09 8765 4321
9 8765 4321
```

Resultado esperado:

Todos deben normalizar a:

```txt
56987654321
```

## 5. Prueba pedido sin teléfono

Pasos:

1. Crear pedido sin teléfono.
2. Confirmar pedido.
3. Revisar `/admin/pedidos`.

Resultado esperado:

- La vista no se rompe.
- No aparece botón activo de WhatsApp.
- Muestra `Sin teléfono` o `WhatsApp no disponible`.

## 6. Prueba teléfono inválido

Probar números como:

```txt
123
abcdef
222222222
569123
```

Resultado esperado:

- No debe abrir WhatsApp.
- Debe mostrar estado inválido o botón deshabilitado.
- No debe romper vista.

## 7. Prueba mensaje

El mensaje debe tener estructura:

```txt
Hola {nombre_cliente}

Tu pedido en Pauli Store fue confirmado:

{detalle_productos}

Total: ${total_pedido}
Retiro/entrega: {fecha_entrega}

Gracias por tu compra.
```

Validar:

- Nombre correcto si existe.
- Productos correctos si existen.
- Cantidades correctas.
- Total correcto si existe.
- Fecha o `Por coordinar` si no existe fecha.
- Sin datos técnicos internos.

## 8. Prueba responsive

Probar en:

```txt
360px
375px
390px
430px
768px
Desktop
```

Resultado esperado:

- Sin scroll horizontal.
- Botón de WhatsApp no tapa contenido.
- Botón flotante no tapa acciones importantes.
- Cards y botones cómodos en móvil.

## 9. Criterio de aprobación

Aprobado si:

- Pauli puede confirmar pedido.
- Pauli puede abrir WhatsApp manual con mensaje listo.
- La app no envía mensajes automáticos todavía.
- El flujo actual de pedidos sigue funcionando.
- El build pasa.
- No se pierden botones ni acciones existentes.
- La arquitectura queda lista para WhatsApp API futura.
