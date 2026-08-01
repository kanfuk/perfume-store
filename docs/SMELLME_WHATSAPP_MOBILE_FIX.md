# Smellme 2.0.0-rc.3 — corrección móvil de WhatsApp

## Causa raíz

`AdminDashboard` abría `window.open("about:blank", "_blank")` antes de llamar la API. Tras el
`await`, intentaba navegar esa ventana con `location.replace`. En móviles, el navegador podía
separar o bloquear el popup y dejar la pestaña preliminar en blanco. El pedido sí podía quedar
mutado, pero la navegación externa no tenía una relación directa con un nuevo gesto del usuario.
No era un problema de CSS, de datos bancarios ni de codificación del mensaje.

El patrón fue eliminado completamente. No quedan `window.open`, `about:blank`, apertura desde
`useEffect`, temporizadores de WhatsApp ni `router.push` hacia destinos externos.

## Patrón vigente

`lib/whatsapp/url.ts` normaliza teléfonos chilenos, limita y normaliza mensajes, aplica
`encodeURIComponent` una sola vez, construye URLs con/sin destinatario, valida `wa.me` y resuelve
el home público desde el origen actual. Los wrappers históricos delegan al mismo módulo.

Las acciones asíncronas usan este orden:

1. bloquean la acción mediante una clave en memoria;
2. llaman la API con timeout;
3. actualizan el pedido y refrescan la vista;
4. terminan loading en `finally`;
5. muestran un bottom sheet con el resultado;
6. el usuario elige `Abrir WhatsApp`, `Copiar mensaje`, `Volver al pedido` o `Cerrar`.

La navegación a WhatsApp ocurre únicamente desde un enlace real pulsado por el usuario. Confirmar
pago no se repite al abrir o copiar el mensaje. Si Clipboard API falla, se usa selección local;
si el teléfono es inválido, el mensaje permanece disponible para copia manual.

## Matriz auditada

| Acción | Archivo | API previa | WhatsApp | Patrón móvil vigente | Riesgo anterior |
|---|---|---:|---:|---|---|
| Compartir mi tiendita | `WhatsAppFloatingButton.tsx` | No | Sí, sin destinatario | enlace directo con home dinámico | mensaje sin home |
| Atender / Agendar | `AdminDashboard.tsx` | Sí, mutación | CTA posterior | bottom sheet después del éxito | popup `about:blank` |
| Reenviar datos | `AdminDashboard.tsx` | Sí, sólo lectura | CTA posterior | mensaje preparado antes del CTA | popup preliminar |
| Confirmar pago | `AdminDashboard.tsx` | Sí, mutación idempotente en servicio | CTA posterior | pago separado del envío | popup preliminar |
| Coordinar entrega | `AdminDashboard.tsx` | Sí, sólo lectura | CTA posterior | enlace tras respuesta | popup preliminar |
| Preparando / Despachado / Entregado | API y servicio de pedidos | Sí, mutación | No automático | sin navegación externa | sin riesgo de popup |
| Confirmación manual de pedido | `OrderWhatsAppButton` | No | Sí | enlace directo en la misma navegación | pestaña auxiliar |
| Aviso de pedido nuevo | `NewOrderWhatsAppButton` | No | Sí, sin destinatario | enlace directo | pestaña auxiliar |
| Cobro individual/agrupado | botones de fiado | No | Sí | enlace directo | pestaña auxiliar |
| Venta directa / personalizado | componentes dedicados | Sí | No automático | permanece en la app | sin popup |

## Enlace de la tienda

El botón conserva el copy aprobado y agrega `new URL("/", window.location.origin)`. Nunca fija
una URL de Preview o producción, y descarta `/admin`, login, query strings y credenciales. Las
pruebas cubren orígenes Vercel y dominio productivo futuro.

## QA ejecutado

- 812 pruebas automatizadas verdes antes del cierre documental.
- Chrome DevTools con user agents equivalentes a iPhone/Safari, Android/Chrome, iPad y Chromium.
- Viewports: 360×800, 390×844, 412×915, 430×932, 768×1024, 1366×768, 1440×900 y 1920×1080.
- En todos: render correcto, sin overflow horizontal, excepciones, errores de consola, 4xx
  inesperados ni 500.
- QA remoto aislado: pedido público entregado y cancelado; venta directa efectivo/transferencia,
  fiado, personalizado, replay idempotente, stock, Top, oferta e imagen administrada.
- Backup final: 16.702 bytes, 14 tablas, 18 registros. El reset retiró un objeto Storage y dejó
  operación, reportes y huérfanos en cero.

La revisión con una sesión real y la apertura de la app WhatsApp en un teléfono físico queda como
checkpoint manual; no se automatizaron credenciales reales.
