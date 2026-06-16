# 11 - QA y plan de pruebas

## Objetivo

Evitar fallos de logica, estados invalidos, errores visuales y problemas de seguridad antes del cierre del MVP.

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
| UX admin final | Pendiente | falta cierre fino mobile-first |

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
