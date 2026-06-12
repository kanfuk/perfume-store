# 14 - Prompts para Codex

## Prompt maestro inicial

```text
Actúa como desarrollador guía para el proyecto Pauli Store.

Debes construir una aplicación web responsive para gestión de pedidos, ventas, costos y fiados de una minipyme casera.

Usa Next.js, React, TypeScript, Tailwind CSS y Supabase.

Sigue estrictamente la documentación del proyecto. No inventes estados nuevos. No sobrecompliques la arquitectura. El código debe ser simple, ordenado, modular y fácil de mantener.

Aplica Programación Orientada a Objetos en la carpeta domain, usando clases como Cliente, Producto, Pedido, DetallePedido, Venta y CuentaFiado.

Considera herencia y polimorfismo solo cuando aporte claridad, especialmente en productos como Pan, Queque o Pack. No fuerces patrones avanzados.

Separa responsabilidades:
- components para UI
- domain para clases y reglas puras
- services para lógica de negocio
- repositories para acceso a Supabase
- lib para helpers, validaciones y constantes

Estados oficiales del pedido:
- PENDIENTE
- AGENDADO
- FINALIZADO
- CANCELADO

Estados oficiales del pago:
- SIN_PAGO
- PAGADO
- FIADO

Reglas importantes:
- Todo pedido nuevo nace PENDIENTE y SIN_PAGO.
- Solo admin puede agendar.
- Al marcar PAGADO o FIADO, el pedido pasa automáticamente a FINALIZADO.
- Pedidos PENDIENTES con más de 72 horas se cancelan automáticamente.
- El total se calcula como precio_unitario * cantidad.
- El cliente no debe escribir precios.
- Los precios deben venir desde productos activos.
- El formulario cliente debe ser simple, intuitivo, moderno, mobile-first y con estilo casero.

Antes de escribir código, indica:
1. Qué archivos vas a crear o modificar.
2. Qué lógica implementarás.
3. Qué reglas de negocio tocarás.
4. Qué pruebas manuales deben realizarse.

Después de escribir código, entrega:
1. Resumen de cambios.
2. Archivos modificados.
3. Cómo ejecutar.
4. Cómo probar.
5. Checklist QA breve.
6. Riesgos o pendientes.
```

## Prompt Fase 1 - Base

```text
Crea la estructura inicial del proyecto Pauli Store con Next.js, TypeScript y Tailwind CSS. Configura carpetas app, components, domain, services, repositories, lib y docs. No implementes lógica compleja todavía. Solo deja estructura, layout base, estilos globales y README inicial.
```

## Prompt Fase 2 - Dominio POO

```text
Implementa las clases de dominio Cliente, Producto, Pedido, DetallePedido, Venta y CuentaFiado en TypeScript. Aplica encapsulamiento, métodos simples, validaciones básicas y reglas de estado según la documentación. No conectes todavía con Supabase.
```

## Prompt Fase 3 - Formulario cliente

```text
Implementa el formulario cliente responsive de Pauli Store. Debe solicitar nombre, teléfono, lugar de trabajo, producto, cantidad, mostrar precio unitario y calcular total automáticamente. Usa diseño cálido, moderno y mobile-first. El pedido debe prepararse con estado_pedido PENDIENTE y estado_pago SIN_PAGO.
```

## Prompt Fase 4 - Supabase

```text
Crea la integración con Supabase. Define cliente Supabase, repositories para productos, clientes, pedidos y pedido_items. No expongas claves privadas. Usa variables de entorno y deja .env.example.
```

## Prompt Fase 5 - Panel admin

```text
Implementa panel admin básico con vistas de pedidos pendientes y agendados. Permite agendar, cancelar, marcar pagado y marcar fiado respetando las reglas de estado. Mantén componentes simples y reutilizables.
```

## Prompt Fase 6 - Fiados y ventas

```text
Implementa gestión de fiados, ventas pagadas y resumen diario. Cuando un pedido se marque como FIADO debe crear registro de fiado. Cuando se marque como PAGADO debe registrar venta pagada.
```

## Prompt QA

```text
Revisa el módulo implementado de Pauli Store como si aplicaras QA técnico.

Verifica:
1. Si cumple los requerimientos documentados.
2. Si respeta estados oficiales.
3. Si aplica POO donde corresponde.
4. Si separa UI, dominio, servicios y repositorios.
5. Si valida campos obligatorios.
6. Si maneja casos borde.
7. Si evita lógica duplicada.
8. Si mantiene seguridad básica.
9. Si funciona en móvil y escritorio.
10. Si el código es entendible y mantenible.

Entrega:
- Errores detectados.
- Riesgos.
- Mejoras necesarias.
- Checklist QA.
- Pruebas sugeridas.
- Código corregido solo si es necesario.
```

## Prompt corrección mínima

```text
No reescribas todo el proyecto.

Corrige solo lo necesario para solucionar el problema indicado.

Mantén:
- Estados oficiales.
- Estructura de carpetas.
- Reglas de negocio.
- Diseño POO.
- Separación entre components, domain, services y repositories.
- Estilo visual de Pauli Store.

Antes de modificar, explícame brevemente:
1. Causa probable del error.
2. Archivo afectado.
3. Cambio mínimo necesario.

Después entrega solo el código necesario o el patch correspondiente.
```
