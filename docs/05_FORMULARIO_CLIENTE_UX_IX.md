# 05 - Formulario cliente, UX e IX

## Objetivo del formulario

Permitir que el cliente registre un pedido de forma simple, rápida e intuitiva desde un link compartido por WhatsApp.

El formulario debe ser:

```text
simple + intuitivo + moderno + cálido + casero
```

## Campos definitivos

| Campo | Tipo | Obligatorio |
|---|---|---|
| Nombre del cliente | Texto | Sí |
| Número de teléfono | Texto | Sí recomendado |
| Lugar de desempeño o trabajo | Texto | Sí |
| Producto | Tarjeta/selector visual | Sí |
| Cantidad | Numérico con + y - | Sí |
| Costo unitario | Automático | Sí |
| Total por cliente | Automático | Sí |

No pedir correo, dirección completa ni creación de cuenta.

## Flujo de interacción

```text
1. Cliente abre link.
2. Ve encabezado Pauli Store.
3. Ingresa sus datos.
4. Selecciona producto.
5. Selecciona cantidad.
6. Ve costo unitario.
7. Ve total.
8. Presiona Registrar mi pedido.
9. Recibe confirmación visual.
```

## Texto de bienvenida

```text
Bienvenido a Pauli Store.
Registra tu pedido de productos caseros de forma rápida y simple.
```

## Texto de confirmación

```text
Pedido registrado correctamente.
Tu pedido quedó pendiente de confirmación.
Pauli revisará disponibilidad y, si corresponde, lo dejará agendado.
```

## Paleta de colores

```text
Fondo principal: #FFF7E8
Tarjetas: #FFFFFF
Primario: #A86B32
Secundario: #F2C879
Texto principal: #3A2A1A
Bordes: #E8D3B0
Éxito: #4F8A5B
Error/cancelado: #B85C5C
Advertencia: #D99A3D
```

## Estructura visual sugerida

```text
[Header]
Pauli Store
Pedidos caseros

[Tarjeta]
Tus datos
- Nombre
- Teléfono
- Lugar de trabajo

[Tarjeta]
Elige tu producto
- Producto 1
- Producto 2
- Producto 3

[Tarjeta]
Cantidad
[-] 1 [+]

[Resumen]
Costo unitario: $X
Total: $Y

[Botón]
Registrar mi pedido
```

## Reglas UX

- Diseño mobile-first.
- Botones grandes.
- Campos con buen espacio.
- Validaciones claras y sin lenguaje técnico.
- Total siempre visible antes de enviar.
- Productos mostrados como tarjetas.
- Cantidad con botones `+` y `-`.
- Evitar saturar al cliente.

## Validaciones visuales

Mensajes sugeridos:

```text
Ingresa tu nombre.
Ingresa tu lugar de trabajo.
Selecciona un producto.
La cantidad debe ser al menos 1.
```

## Comportamiento técnico

El cliente no debe enviar el precio como dato confiable. El frontend puede mostrar el precio, pero el backend/service debe recalcular el total usando el producto real.
