# 13 - Roadmap de implementación

## Regla principal

No construir todo de una vez.

Implementar por fases y probar antes de avanzar.

## Fase 1 - Base del proyecto

Objetivo:

```text
Crear estructura inicial con Next.js, TypeScript y Tailwind.
```

Entregables:

```text
Estructura de carpetas
Layout base
README
Carpeta docs
Estilos globales
```

No implementar lógica compleja.

## Fase 2 - Dominio POO

Objetivo:

```text
Crear clases domain y constantes de estados.
```

Entregables:

```text
Cliente.ts
Producto.ts
Pedido.ts
DetallePedido.ts
Venta.ts
CuentaFiado.ts
constants.ts
validators.ts
```

## Fase 3 - Formulario cliente con datos mock

Objetivo:

```text
Crear formulario visual y cálculo de total sin Supabase todavía.
```

Entregables:

```text
PedidoForm
ProductoCard
TotalPedido
Validaciones visuales
Diseño responsive
```

## Fase 4 - Supabase y modelo de datos

Objetivo:

```text
Crear conexión a base de datos y repositories.
```

Entregables:

```text
supabaseClient.ts
repositories
.env.example
scripts SQL opcionales
```

## Fase 5 - Registro real de pedidos

Objetivo:

```text
Guardar pedidos reales en Supabase.
```

Entregables:

```text
crearPedido()
insertarCliente()
insertarPedido()
insertarPedidoItem()
```

## Fase 6 - Panel admin básico

Objetivo:

```text
Ver pedidos pendientes y agendados.
```

Entregables:

```text
Login admin
Dashboard básico
Tabla/card de pedidos
Agendar
Cancelar
```

## Fase 7 - Pagados y fiados

Objetivo:

```text
Cerrar pedidos como pagados o fiados.
```

Entregables:

```text
marcarPedidoPagado()
marcarPedidoFiado()
registrarFiado()
registrarPago()
```

## Fase 8 - Reportes básicos

Objetivo:

```text
Mostrar ventas, fiados y producción sugerida.
```

Entregables:

```text
Resumen dashboard
Ventas del día
Total fiado
Producción sugerida
```

## Fase 9 - Seguridad y QA

Objetivo:

```text
Revisar seguridad, permisos y pruebas.
```

Entregables:

```text
RLS
Headers
QA checklist
Plan de pruebas
Correcciones
```

## Fase 10 - Deploy MVP

Objetivo:

```text
Publicar versión inicial.
```

Entregables:

```text
Deploy en Vercel
Variables configuradas
Prueba desde celular
Prueba desde PC
```
