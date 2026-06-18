# 29 - Ajustes finales admin, productos y QA

## 1. Estado actual final de la app

Pauli Store queda con cliente publico, admin modular, venta directa, pedido personalizado, catalogo ampliado y base operativa limpia.

## 2. Cambios en navegacion admin por paginas y vistas

- `/admin` se mantiene como home
- `/admin/pedidos`, `/admin/stock`, `/admin/ventas`, `/admin/reportes`, `/admin/clientes` y `/admin/venta-directa` funcionan como vistas independientes
- cada vista interna muestra encabezado propio

## 3. Limpieza de botonera superior

- se elimino `Venta directa` de la botonera superior
- en home queda foco en `Actualizar` y `Cerrar sesion`
- en vistas internas aparece `Inicio`, `Actualizar` y `Cerrar sesion`

## 4. Estandarizacion de chips y recuadros

- radios mas uniformes
- alturas minimas consistentes
- badges y cards pequenas con espaciado mas estable

## 5. Eliminacion de rutina limpiar datos de prueba

- se retiro de la interfaz de Ventas
- se mantiene fuera del flujo UI normal

## 6. Mantencion de cierre de mes

- `Cierre de mes` sigue disponible en Ventas

## 7. Productos agregados

- Dobladita ave mayo
- Dobladita ave pimenton
- Quequito marmoleado
- Quequito banana bread
- Quequito choco chip sugar free
- Carrot cake con nueces
- Queque de platano
- Queque marmoleado
- Pedido personalizado

## 8. Productos activos

- Dobladita solo queso
- Dobladita jamon de pavo acaramelado/queso
- Dobladita huevo
- Dobladita ave mayo
- Quequito marmoleado
- Quequito banana bread
- Quequito choco chip sugar free
- Carrot cake con nueces

## 9. Productos inactivos

- Dobladita ave pimenton
- Queque de platano
- Queque marmoleado
- Pedido personalizado

## 10. Productos con stock 0

- Dobladita ave pimenton
- Quequito marmoleado
- Quequito banana bread
- Quequito choco chip sugar free
- Carrot cake con nueces
- Queque de platano
- Queque marmoleado
- Pedido personalizado

## 11. Precios confirmados

- Quequitos y carrot cake porcion: `1000`
- Dobladita ave mayo: `1500`

## 12. Productos con precio pendiente

- Dobladita ave pimenton
- Queque de platano
- Queque marmoleado
- Pedido personalizado

## 13. Imagenes agregadas

- `/images/products/dobladita-ave-mayo.png`
- `/images/products/dobladita-ave-pimenton.jpeg`
- `/images/products/quequito-marmoleado.png`
- `/images/products/quequito-banana-bread.png`
- `/images/products/quequito-choco-chip-sugar-free.png`
- `/images/products/carrot-cake-nueces.png`
- `/images/products/queque-platano.png`
- `/images/products/queque-marmoleado.png`
- `/images/products/pedido-personalizado.png`

## 14. QA de fotos

- cliente, venta directa y stock usan rutas consistentes bajo `/images/products/...`
- productos sin imagen confirmada deben usar placeholder o quedar inactivos

## 15. QA responsive

- botonera superior sin overflow horizontal
- chips y cards revisados para 360px, 375px, 390px y 430px
- boton minimal de Inicio en mobile para vistas internas

## 16. QA funcional local

- revisar cliente
- revisar admin por modulo
- revisar venta directa y pedido personalizado

## 17. QA funcional post-deploy

- verificar deploy Ready en Vercel
- probar rutas publicas y admin
- validar productos, fotos, precios y navegacion

## 18. Pendientes futuros

- confirmar precios de productos inactivos
- seguir QA en telefono real
