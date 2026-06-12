# 09 - Servicios y repositorios

## Objetivo

Separar la lógica de negocio del acceso a datos.

## Regla general

```text
components = interfaz
services = reglas de negocio
repositories = base de datos
domain = clases puras
lib = helpers y constantes
```

## Services

Los services aplican reglas de negocio.

### pedidoService.ts

Funciones:

```text
crearPedido()
agendarPedido()
cancelarPedido()
marcarPedidoPagado()
marcarPedidoFiado()
cancelarPedidosPendientesExpirados()
obtenerPedidosPendientes()
obtenerPedidosAgendados()
```

### productoService.ts

Funciones:

```text
crearProducto()
editarProducto()
activarProducto()
desactivarProducto()
obtenerProductosActivos()
calcularUtilidadProducto()
```

### ventaService.ts

Funciones:

```text
registrarVentaPagada()
calcularVentasDelDia()
calcularVentasSemana()
calcularUtilidadEstimada()
```

### fiadoService.ts

Funciones:

```text
registrarFiado()
obtenerFiadosPendientes()
marcarFiadoComoPagado()
calcularTotalFiado()
```

### reporteService.ts

Funciones:

```text
obtenerResumenDashboard()
obtenerProduccionSugerida()
obtenerProductosMasVendidos()
obtenerReporteSemanal()
```

## Repositories

Los repositories interactúan con Supabase.

### pedidoRepository.ts

Funciones:

```text
insertarPedido()
insertarPedidoItem()
actualizarEstadoPedido()
buscarPedidosPorEstado()
buscarPedidoPorId()
buscarPedidosExpirados()
```

### productoRepository.ts

Funciones:

```text
insertarProducto()
actualizarProducto()
buscarProductosActivos()
buscarProductoPorId()
```

### clienteRepository.ts

Funciones:

```text
insertarCliente()
buscarClientePorTelefono()
buscarClientePorId()
```

### ventaRepository.ts

Funciones:

```text
insertarPago()
buscarVentasPorFecha()
calcularTotalVentasPagadas()
```

### fiadoRepository.ts

Funciones:

```text
insertarFiado()
buscarFiadosPendientes()
marcarFiadoPagado()
```

## Regla importante

No poner consultas Supabase directamente dentro de componentes React, salvo casos muy simples de lectura pública. Preferir services/repositories.

## Flujo ideal al crear pedido

```text
PedidoForm -> pedidoService.crearPedido() -> repositories -> Supabase
```

## Flujo ideal al agendar

```text
Botón admin -> pedidoService.agendarPedido() -> pedidoRepository.actualizarEstadoPedido()
```
