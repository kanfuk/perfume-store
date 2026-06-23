# 33 - Fase final: Confirmación de pedidos por WhatsApp

## Objetivo

Implementar un sistema de notificación por WhatsApp para Pauli Store cuando Pauli confirme un pedido.

La solución debe funcionar en dos etapas:

1. **Modo manual actual:** generar un botón de WhatsApp con mensaje prellenado para que Pauli lo envíe manualmente.
2. **Modo automático futuro:** dejar preparada la arquitectura para enviar el mensaje automáticamente mediante WhatsApp Business API cuando se contrate o pague el servicio.

La implementación debe ser escalable, segura y no debe romper el flujo actual de pedidos.

## 1. Flujo de negocio esperado

### Flujo actual manual

1. Cliente realiza un pedido desde la app.
2. El pedido queda registrado en el panel administrador.
3. Pauli revisa el pedido.
4. Pauli confirma el pedido desde el panel.
5. Al confirmar, la app debe generar una opción clara para enviar WhatsApp al cliente.
6. Pauli presiona el botón.
7. Se abre WhatsApp Web o WhatsApp móvil con el mensaje listo.
8. Pauli revisa y envía manualmente.

## 2. Flujo futuro automático

Cuando se pague o active WhatsApp Business API:

1. Cliente realiza pedido.
2. Pauli confirma pedido.
3. La app llama a un servicio interno de notificaciones.
4. El servicio detecta el modo activo:
   - `manual`
   - `automatic`
5. En modo automático, la app envía el mensaje por API.
6. Se registra el estado de la notificación:
   - `pendiente`
   - `enviada`
   - `fallida`
7. El panel muestra si el mensaje fue enviado correctamente.

## 3. Regla principal de arquitectura

No poner la lógica de WhatsApp directamente dentro del componente visual.

Crear una capa intermedia:

```txt
Pedido confirmado
        ↓
NotificationService
        ↓
WhatsAppNotificationProvider
        ↓
ManualWhatsAppProvider / WhatsAppApiProvider futuro
```

Esto permite que hoy funcione manualmente y mañana se active automático sin reescribir todo.

## 4. Modo manual actual

### Comportamiento

Cuando un pedido esté confirmado, debe mostrarse un botón:

```txt
Enviar WhatsApp
```

Este botón debe abrir:

```txt
https://wa.me/<telefono_cliente>?text=<mensaje_codificado>
```

### Requisitos

- El número debe limpiarse antes de construir el link.
- Debe incluir código país de Chile: `56`.
- El mensaje debe ir codificado con `encodeURIComponent`.
- Si el cliente no tiene teléfono, no mostrar botón activo de WhatsApp o mostrar estado `Sin teléfono`.
- El botón no debe reemplazar ninguna acción actual del pedido.
- No debe eliminar botones existentes.
- No debe cambiar el estado del pedido por sí solo.
- No debe marcar como enviado automáticamente si solo se abrió el link.

## 5. Formato de teléfono

Crear una utilidad para normalizar teléfonos.

### Entrada posible

```txt
987654321
+56987654321
56987654321
09 8765 4321
9 8765 4321
```

### Salida esperada

```txt
56987654321
```

### Reglas

- Eliminar espacios, guiones, paréntesis y símbolos.
- Si empieza con `+`, eliminar el `+`.
- Si tiene 9 dígitos y empieza con `9`, anteponer `56`.
- Si tiene 11 dígitos y empieza con `56`, dejar igual.
- Si no es válido, devolver `null` o estado inválido.
- No intentar enviar WhatsApp si el número no es válido.

## 6. Mensaje sugerido para confirmación

El mensaje debe ser cálido, breve y claro.

### Plantilla base

```txt
Hola {nombre_cliente}

Tu pedido en Pauli Store fue confirmado:

{detalle_productos}

Total: ${total_pedido}
Retiro/entrega: {fecha_entrega}

Gracias por tu compra.
```

### Consideraciones

- Si no existe fecha de entrega, usar `Por coordinar`.
- Si no existe nombre, usar `Hola`.
- Si no existe total, no inventarlo.
- Si no existe detalle de productos, mostrar `Tu pedido fue confirmado correctamente.`
- El mensaje no debe contener datos técnicos internos.
- El mensaje debe ser fácil de editar en el futuro.

## 7. Ubicación visual del botón

El botón debe aparecer donde Pauli naturalmente confirma o revisa pedidos.

Opciones recomendadas:

1. En la card del pedido confirmado.
2. En el detalle del pedido.
3. Junto a las acciones actuales del pedido.

## 8. Estados visuales sugeridos

### Pedido con teléfono válido

Mostrar botón activo:

```txt
Enviar WhatsApp
```

### Pedido sin teléfono

Mostrar:

```txt
Sin teléfono
```

### Número inválido

Mostrar aviso pequeño:

```txt
Teléfono inválido
```

### Modo automático futuro

Cuando exista API:

```txt
WhatsApp enviado
WhatsApp pendiente
WhatsApp falló
```

## 9. Variables de entorno futuras

Dejar preparada la configuración sin obligar a usarla ahora.

```env
WHATSAPP_MODE=manual
WHATSAPP_PROVIDER=manual
WHATSAPP_API_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
```

## 10. Servicios sugeridos

- `lib/phone/normalizeChilePhone.ts`
- `lib/whatsapp/buildOrderConfirmationMessage.ts`
- `lib/whatsapp/buildWhatsAppManualUrl.ts`
- `services/NotificationService.ts`
- `services/whatsapp/ManualWhatsAppProvider.ts`
- `services/whatsapp/WhatsAppApiProvider.ts`

## 11. Interfaz sugerida TypeScript

```ts
export interface WhatsAppNotificationProvider {
  createOrderConfirmation(data: OrderNotificationData): WhatsAppNotificationResult;
}
```

```ts
export interface OrderNotificationData {
  customerName?: string;
  customerPhone?: string;
  items: Array<{
    name: string;
    quantity: number;
  }>;
  total?: number;
  deliveryDateLabel?: string;
}
```

```ts
export interface WhatsAppNotificationResult {
  mode: "manual" | "automatic";
  status: "ready" | "sent" | "failed" | "unavailable";
  url?: string;
  message?: string;
  error?: string;
}
```

## 12. No modificar

No modificar:

- Flujo de creación de pedidos.
- Flujo de stock.
- Flujo de pagos.
- Flujo de fiados.
- Reportes.
- Autenticación.
- Estructura de Supabase.
- Seeds actuales.
- Productos.
- Botón flotante actual de WhatsApp/Home.
- Navegación actual.

## 13. QA obligatorio

Ejecutar:

```bash
npm run typecheck
npm run lint
npm run build
```

Validar manualmente:

```txt
/admin/pedidos
/admin/clientes
/admin/stock
/admin/ventas
/admin/reportes
/#hacer-pedido
/
```

## 14. Criterios de aceptación

La fase queda aprobada si:

- Pauli puede confirmar un pedido.
- Luego puede enviar WhatsApp manual con mensaje listo.
- El mensaje contiene cliente, productos y total si existen.
- El sistema no falla si no hay teléfono.
- No se pierde ninguna funcionalidad existente.
- La arquitectura queda preparada para WhatsApp API.
- El build pasa correctamente.
