# 35 - WhatsApp automático al agendar pedidos

## Objetivo

Automatizar parcialmente el flujo de agenda de pedidos en Pauli Store.

Cuando Pauli confirme o agende un pedido, la aplicación debe abrir automáticamente WhatsApp con el mensaje prellenado para el cliente registrado.

Esto no significa enviar mensajes por API todavía. El envío sigue siendo manual: la app solo abre WhatsApp con el texto listo para que Pauli revise y presione enviar.

## 1. Problema actual

Actualmente Pauli puede ver un pedido agendado y presionar manualmente el botón `Enviar WhatsApp`.

El flujo funciona, pero tiene fricción:

1. Pauli confirma o agenda el pedido.
2. Luego debe ubicar el pedido.
3. Luego debe presionar `Enviar WhatsApp`.
4. Luego recién envía el mensaje.

La mejora busca que el paso 3 ocurra automáticamente al momento de agendar.

## 2. Flujo esperado nuevo

```txt
Pauli presiona Agendar / Confirmar pedido
        ↓
La app actualiza estado del pedido a AGENDADO / CONFIRMADO
        ↓
Si el pedido se actualizó correctamente
        ↓
La app prepara mensaje WhatsApp
        ↓
La app abre WhatsApp automáticamente
        ↓
Pauli revisa y envía manualmente
```

El botón manual `Enviar WhatsApp` debe seguir visible como respaldo.

## 3. Comportamiento obligatorio

### Pedido con teléfono válido

Al confirmar o agendar:

- El pedido debe pasar correctamente a estado agendado o confirmado.
- La app debe abrir WhatsApp con mensaje prellenado.
- El botón manual `Enviar WhatsApp` debe mantenerse visible.
- No se debe marcar automáticamente como mensaje enviado.

### Pedido sin teléfono

Al confirmar o agendar:

- El pedido debe quedar agendado igual.
- La app no debe fallar.
- Debe mostrar aviso claro:

```txt
Pedido agendado, pero el cliente no tiene teléfono válido para WhatsApp.
```

### Pedido con teléfono inválido

Al confirmar o agendar:

- El pedido debe quedar agendado igual.
- La app no debe fallar.
- Debe mostrar aviso claro:

```txt
Pedido agendado, pero el teléfono del cliente no es válido para WhatsApp.
```

### Si falla Supabase o la actualización del pedido

- No abrir WhatsApp.
- Mostrar error normal de la app.
- No cambiar visualmente el pedido a agendado si la base de datos no confirmó el cambio.

## 4. Regla técnica importante

La apertura de WhatsApp debe ocurrir como consecuencia directa del click del usuario.

Usar:

```ts
window.open(url, "_blank", "noopener,noreferrer");
```

Si `window.open` devuelve `null`, mostrar aviso:

```txt
Pedido agendado. Si WhatsApp no se abrió, usa el botón Enviar WhatsApp.
```

## 5. Reutilización obligatoria

No duplicar lógica.

Reutilizar estas piezas si existen:

- `normalizeChilePhone`
- `buildOrderConfirmationMessage`
- `buildWhatsAppManualUrl`
- `NotificationService`
- `ManualWhatsAppProvider`

La URL debe ser la misma que usa el botón manual.

## 6. Mensaje WhatsApp

Usar el mismo mensaje de confirmación definido para la fase WhatsApp:

```txt
Hola {nombre_cliente}

Tu pedido en Pauli Store fue confirmado:

{detalle_productos}

Total: ${total_pedido}
Retiro/entrega: {fecha_entrega}

Gracias por tu compra.
```

Reglas:

- Si no hay nombre, usar `Hola`.
- Si no hay productos, usar `Tu pedido fue confirmado correctamente.`
- Si no hay total, no inventarlo.
- Si no hay fecha, usar `Por coordinar`.
- No incluir datos técnicos internos.

## 7. Lugar de integración

Buscar el handler actual que confirma o agenda el pedido.

La lógica debe integrarse después de confirmar que el cambio de estado fue exitoso.

## 8. No modificar

No modificar:

- Estructura de Supabase.
- Tablas.
- Seeds.
- Productos.
- Stock.
- Ventas.
- Fiados.
- Clientes, salvo lectura de datos necesarios.
- Autenticación.
- Navbar.
- Botón flotante WhatsApp/Home.
- Botón manual `Enviar WhatsApp`.
- Diseño completo de la app.

Esta tarea es una mejora incremental del flujo de agenda, no una reescritura.

## 9. Criterios de aceptación

La tarea queda aprobada si:

- Al agendar un pedido con teléfono válido se abre WhatsApp automáticamente.
- El pedido queda efectivamente agendado antes de abrir WhatsApp.
- Si falla la actualización, WhatsApp no se abre.
- Si falta teléfono, el pedido se agenda igual y se muestra aviso.
- El botón manual `Enviar WhatsApp` sigue funcionando.
- No se rompe pagos, fiados ni cancelar.
- No se rompe clientes, stock, ventas ni formulario público.
- No aparece navbar inferior.
- El build pasa correctamente.
