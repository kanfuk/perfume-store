# 11 - QA y plan de pruebas

## Objetivo

Evitar fallos de logica, estados invalidos, errores visuales, scrolles inesperados y problemas de seguridad antes del cierre del MVP.

## Estado de verificacion actual

| Criterio | Estado | Evidencia |
|---|---|---|
| Compila sin errores | OK | `npm run build` |
| TypeScript sin errores | OK | `npm run typecheck` |
| Lint base | OK | `npm run lint` |
| Pruebas automatizadas | OK | `npm run test:run` |
| Flujo cliente operativo | OK | pedido registrado en Supabase |
| Login admin operativo | OK | acceso con Supabase Auth |
| Seguridad base aplicada | Parcial | headers, RLS, env, security.txt |
| UX admin final | OK | rutas y modulos responsive activos |
| Selector fechas movil | OK | filtros apilados correctamente |
| Scroll horizontal cliente | OK | overflow-x controlado |
| Scroll horizontal admin | OK | wrappers y `min-w-0` aplicados |
| Riesgo de hidratacion por fecha | OK | fecha dinamica diferida al cliente en modal admin |
| Iconografia final | OK | favicon SVG y `app/icon.svg` alineados |

## QA formulario cliente

Probar:

```text
Nombre vacio
Telefono vacio
Telefono invalido para Chile
Lugar vacio
Producto no seleccionado
Cantidad 0
Cantidad negativa
Pedido correcto
Autorrelleno de cliente frecuente
Vista movil
Vista escritorio
Fallback visual de producto si una imagen falla
```

## QA panel admin

Probar:

```text
Login correcto
Usuario fuera de usuarios_admin no entra
Ver pedidos pendientes
Agendar pedido
Cancelar pedido
Marcar pagado
Marcar fiado
Revisar historial
Editar producto
Activar y desactivar producto
Revisar filtros de fecha en 360px, 390px y 430px
Revisar navbar movil admin
Abrir modal de agenda y confirmar fecha por defecto estable
```

## Pruebas desde celular

Usar preferentemente un telefono real sobre la URL de produccion en Vercel.

Checklist sugerido:

```text
Abrir la home y confirmar que el hero carga completo sin scroll horizontal
Verificar que el carrito inferior no tape el contenido final
Abrir varias tarjetas de producto y confirmar que las imagenes o su fallback se ven bien
Registrar un pedido completo desde celular
Entrar al admin y revisar /admin/pedidos, /admin/stock, /admin/ventas, /admin/reportes y /admin/clientes
Probar filtros de fecha en admin/reportes
Confirmar que navbar inferior admin no tapa botones ni tablas
Revisar favicon actualizado al abrir la app en el navegador movil
Probar en ancho aproximado 360px, 390px y 430px
```

Rutas recomendadas para probar en produccion:

```text
/
/admin
/admin/pedidos
/admin/stock
/admin/ventas
/admin/reportes
/admin/clientes
```

## QA de seguridad

Validar:

```text
No exponer secret key en cliente
Headers presentes en respuesta HTTP
security.txt accesible
Cliente no cambia estados ni pagos
Admin usa sesion real
RLS activo en tablas principales
```

## Casos clave de negocio

### Pedido basico

Entrada:

```text
Nombre: Rodrigo
Telefono: +56 9 9999 9999
Lugar: Finanzas
Producto: Pan amasado
Cantidad: 2
Precio: 500
```

Esperado:

```text
Total: 1000
estado_pedido: PENDIENTE
estado_pago: SIN_PAGO
```

### Agendar pedido

Inicial:

```text
PENDIENTE / SIN_PAGO
```

Accion:

```text
Agendar
```

Esperado:

```text
AGENDADO / SIN_PAGO
fecha_agendado registrada
```

### Marcar pagado

Inicial:

```text
AGENDADO / SIN_PAGO
```

Accion:

```text
Marcar pagado
```

Esperado:

```text
FINALIZADO / PAGADO
fecha_cierre registrada
```

### Marcar fiado

Inicial:

```text
AGENDADO / SIN_PAGO
```

Accion:

```text
Marcar fiado
```

Esperado:

```text
FINALIZADO / FIADO
registro en fiados
```
