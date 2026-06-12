# 07 - Modelo de datos

## Tabla clientes

```text
id UUID PK
nombre TEXT NOT NULL
telefono TEXT
lugar_trabajo TEXT NOT NULL
created_at TIMESTAMP
updated_at TIMESTAMP
```

## Tabla productos

```text
id UUID PK
nombre TEXT NOT NULL
descripcion TEXT
precio_venta INTEGER NOT NULL
costo_unitario INTEGER NOT NULL DEFAULT 0
stock_actual INTEGER DEFAULT 0
activo BOOLEAN DEFAULT true
tipo_producto TEXT
created_at TIMESTAMP
updated_at TIMESTAMP
```

## Tabla pedidos

```text
id UUID PK
cliente_id UUID FK -> clientes.id
estado_pedido TEXT NOT NULL
estado_pago TEXT NOT NULL
total INTEGER NOT NULL
observacion TEXT
motivo_cancelacion TEXT
fecha_pedido TIMESTAMP
fecha_agendado TIMESTAMP
fecha_cierre TIMESTAMP
fecha_cancelacion TIMESTAMP
created_at TIMESTAMP
updated_at TIMESTAMP
```

## Tabla pedido_items

```text
id UUID PK
pedido_id UUID FK -> pedidos.id
producto_id UUID FK -> productos.id
cantidad INTEGER NOT NULL
precio_unitario INTEGER NOT NULL
subtotal INTEGER NOT NULL
created_at TIMESTAMP
```

## Tabla pagos

```text
id UUID PK
pedido_id UUID FK -> pedidos.id
monto INTEGER NOT NULL
metodo_pago TEXT
estado_pago TEXT NOT NULL
fecha_pago TIMESTAMP
created_at TIMESTAMP
```

## Tabla fiados

```text
id UUID PK
pedido_id UUID FK -> pedidos.id
cliente_id UUID FK -> clientes.id
monto_pendiente INTEGER NOT NULL
estado TEXT NOT NULL
fecha_fiado TIMESTAMP
fecha_pago_fiado TIMESTAMP
created_at TIMESTAMP
updated_at TIMESTAMP
```

## Tabla usuarios_admin

```text
id UUID PK
email TEXT NOT NULL
nombre TEXT
rol TEXT NOT NULL
activo BOOLEAN DEFAULT true
created_at TIMESTAMP
updated_at TIMESTAMP
```

## Constantes de estado

```text
ESTADO_PEDIDO_PENDIENTE = "PENDIENTE"
ESTADO_PEDIDO_AGENDADO = "AGENDADO"
ESTADO_PEDIDO_FINALIZADO = "FINALIZADO"
ESTADO_PEDIDO_CANCELADO = "CANCELADO"

ESTADO_PAGO_SIN_PAGO = "SIN_PAGO"
ESTADO_PAGO_PAGADO = "PAGADO"
ESTADO_PAGO_FIADO = "FIADO"
```

## Relaciones principales

```text
clientes 1 - N pedidos
pedidos 1 - N pedido_items
productos 1 - N pedido_items
pedidos 1 - 0..1 pagos
pedidos 1 - 0..1 fiados
clientes 1 - N fiados
```

## Reglas de integridad

- No permitir pedido sin cliente.
- No permitir item sin producto.
- No permitir cantidad menor a 1.
- No permitir total negativo.
- No permitir estado fuera de constantes.
- No borrar productos con pedidos asociados; usar `activo = false`.
