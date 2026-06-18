# 30 - Scroll interno, WhatsApp floating y QA

## 1. Estado actual de la app

Pauli Store mantiene cliente publico, admin modular, venta directa, pedido personalizado, catalogo vigente y despliegue operativo.

## 2. Problema detectado de scroll interno

El principal problema estaba en `/admin/stock`, dentro del modal de crear y editar productos.

- el overlay del modal tenia scroll
- el panel interno tambien tenia scroll
- header y footer sticky reducian el espacio util
- en mobile se hacia dificil llegar al final del formulario y al boton `Guardar producto`

## 3. Correccion aplicada en edicion de productos

- se dejo un solo contenedor interno con `overflow-y-auto`
- el modal ahora usa layout en columna con header fijo, body scrolleable y footer fijo
- se agrego `max-height` basada en `100dvh`
- se agrego padding inferior con `env(safe-area-inset-bottom)`
- los botones finales quedaron con altura minima estable

## 4. Correcciones aplicadas en modales, formularios y paneles

- modal de producto en `/admin/stock`
- modal corto de acciones en pedidos y ventas con altura maxima controlada
- `main` admin y `venta-directa` con espacio inferior extra para navbar y safe-area
- boton flotante de WhatsApp oculto cuando hay modal abierto en admin dashboard

## 5. Reglas UX para scroll interno

- evitar doble scroll en overlay y panel interno
- usar `min-h-0` y `overflow-y-auto` en el contenedor correcto
- respetar `100dvh` y safe-area en mobile
- dejar padding inferior suficiente para no tapar botones finales

## 6. Boton flotante WhatsApp

Se agrego `components/shared/WhatsAppFloatingButton.tsx`.

- flotante
- minimalista
- visible en vistas admin
- por debajo de modales
- con `aria-label` y `title`

## 7. Mensaje WhatsApp configurado

```text
Hola! Ya esta disponible el link para registrar pedidos en Pauli Store.
Ingresa aqui:
https://pauli-store-clientes.vercel.app/
```

## 8. Link publico configurado

- `https://pauli-store-clientes.vercel.app/`

## 9. QA mobile realizado

- revisar modal de producto en `360px`, `375px`, `390px` y `430px`
- revisar formularios largos de `venta-directa`
- revisar que no aparezca scroll horizontal global

## 10. QA WhatsApp realizado

- boton visible solo en admin
- boton no tapa navbar inferior
- boton abre `wa.me` con mensaje precargado
- no hay envio automatico

## 11. Pendientes futuros

- validar en telefono real con teclado abierto
- si existe link fijo de grupo, moverlo a `NEXT_PUBLIC_WHATSAPP_GROUP_URL`
- si se quiere texto editable, moverlo a `NEXT_PUBLIC_WHATSAPP_SHARE_URL`
