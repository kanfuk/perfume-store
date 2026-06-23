# 36 - Checklist QA WhatsApp automático al agendar

## Build

- [ ] `npm run typecheck` pasa.
- [ ] `npm run lint` pasa.
- [ ] `npm run build` pasa.

## Flujo con teléfono válido

- [ ] Crear pedido con teléfono válido.
- [ ] Presionar Agendar o Confirmar.
- [ ] Pedido cambia correctamente a Agendado o Confirmado.
- [ ] Se abre WhatsApp automáticamente.
- [ ] El mensaje aparece prellenado.
- [ ] El mensaje contiene nombre si existe.
- [ ] El mensaje contiene productos si existen.
- [ ] El mensaje contiene total si existe.
- [ ] El botón manual `Enviar WhatsApp` sigue visible.

## Flujo sin teléfono

- [ ] Crear pedido sin teléfono.
- [ ] Presionar Agendar o Confirmar.
- [ ] Pedido queda agendado igual.
- [ ] No se rompe la vista.
- [ ] Se muestra aviso de teléfono no disponible.
- [ ] No se abre WhatsApp.

## Flujo con teléfono inválido

- [ ] Crear pedido con teléfono inválido.
- [ ] Presionar Agendar o Confirmar.
- [ ] Pedido queda agendado igual.
- [ ] No se rompe la vista.
- [ ] Se muestra aviso de teléfono inválido.
- [ ] No se abre WhatsApp.

## Fallo de actualización

- [ ] Si falla Supabase, no se abre WhatsApp.
- [ ] Si falla Supabase, el pedido no queda visualmente agendado de forma falsa.
- [ ] Se muestra error normal de la app.

## Funcionalidades preservadas

- [ ] Botón `Pagado` sigue funcionando.
- [ ] Botón `Fiado` sigue funcionando.
- [ ] Botón `Cancelar` sigue funcionando.
- [ ] Botón manual `Enviar WhatsApp` sigue funcionando.
- [ ] Botón flotante WhatsApp/Home sigue funcionando.
- [ ] No aparece navbar inferior.

## Rutas

- [ ] `/` funciona.
- [ ] `/#hacer-pedido` funciona.
- [ ] `/admin` funciona.
- [ ] `/admin/pedidos` funciona.
- [ ] `/admin/clientes` funciona.
- [ ] `/admin/stock` funciona.
- [ ] `/admin/ventas` funciona.
- [ ] `/admin/reportes` funciona.
- [ ] `/admin/venta-directa` funciona.
