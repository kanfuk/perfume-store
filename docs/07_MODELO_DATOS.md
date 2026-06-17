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
image_url TEXT
badge_label TEXT
costo_unitario INTEGER NOT NULL DEFAULT 0
stock_actual INTEGER DEFAULT 0
stock_agenda INTEGER DEFAULT 0
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
origen_pedido TEXT DEFAULT 'PUBLICO'
total INTEGER NOT NULL
observacion TEXT
motivo_cancelacion TEXT
fecha_pedido TIMESTAMP
fecha_entrega DATE
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
producto_id UUID FK -> productos.id NULLABLE
producto_nombre TEXT
producto_descripcion TEXT
producto_image_url TEXT
producto_tipo TEXT
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

## Reglas nuevas

- `PUBLICO` para formulario cliente
- `ADMIN_DIRECTO` para venta in situ
- `PERSONALIZADO` para pedidos especiales
- si un item no usa `producto_id`, debe guardar snapshot del producto libre
