# 16 - Encabezados de código

## Objetivo

Usar encabezados simples en archivos importantes para mantener orden y trazabilidad.

No poner encabezados gigantes en todos los componentes pequeños. Usar principalmente en:

```text
services
repositories
domain
lib/constants
lib/validators
```

## Encabezado estándar

```ts
/**
 * Proyecto: Pauli Store
 * Módulo: [Nombre del módulo]
 * Descripción: [Breve descripción del archivo]
 * Autor: Equipo Pauli Store
 * Buenas prácticas: Código modular, validado y orientado a mantenibilidad.
 * Seguridad: No incluir claves ni datos sensibles en este archivo.
 */
```

## Ejemplo para pedidoService.ts

```ts
/**
 * Proyecto: Pauli Store
 * Módulo: Gestión de Pedidos
 * Descripción: Servicio encargado de aplicar reglas de negocio sobre pedidos.
 * Autor: Equipo Pauli Store
 * Buenas prácticas: Separación de responsabilidades y validación de estados.
 * Seguridad: No incluir claves ni datos sensibles en este archivo.
 */
```

## Regla

El encabezado no reemplaza el código claro. El código debe entenderse por nombres, estructura y responsabilidades.
