# 01 - Visión general del proyecto

## Nombre del sistema

**Pauli Store**

## Nombre completo

**Pauli Store - Plataforma de Gestión de Pedidos y Ventas**

## Nombre del repositorio

```text
pauli-store-app
```

## Descripción breve

Pauli Store será una aplicación web responsive para registrar pedidos de productos caseros mediante un formulario compartido por WhatsApp y administrar pedidos, productos, ventas, costos y fiados desde un panel privado.

## Problema a resolver

Actualmente los pedidos pueden perderse en conversaciones de WhatsApp, anotaciones manuales o memoria. Eso dificulta saber:

- Quién pidió.
- Qué producto pidió.
- Cuánto pidió.
- Cuánto debe pagar.
- Si el pedido fue agendado.
- Si el cliente pagó o quedó fiado.
- Cuánto producir.
- Cuánto se vendió en el día o semana.

## Objetivo general

Crear una plataforma simple, ordenada y visualmente atractiva para que clientes registren pedidos y Pauli pueda administrar el flujo completo desde celular o computador.

## Usuarios principales

### Cliente

Persona que recibe el link por WhatsApp y registra su pedido.

### Pauli / Administrador

Usuario autenticado que gestiona productos, pedidos, ventas y fiados.

## Alcance inicial MVP

El MVP debe incluir:

- Formulario público de pedido.
- Registro de clientes simples.
- Productos activos.
- Cálculo automático de total.
- Pedido en estado `PENDIENTE`.
- Panel admin con pedidos pendientes y agendados.
- Cambio de estado a `AGENDADO`.
- Cambio automático a `FINALIZADO` al marcar `PAGADO` o `FIADO`.
- Registro de fiados.
- Reportes básicos.
- Seguridad básica con login admin.

## Fuera del alcance inicial

No implementar en primera fase:

- Pago online con Webpay.
- WhatsApp automático oficial.
- Facturación electrónica.
- Inventario avanzado por receta.
- Multi-sucursal.
- App móvil nativa.

Estas funciones pueden quedar para fases futuras.

## Stack técnico recomendado

```text
Frontend: Next.js + React + TypeScript
Estilos: Tailwind CSS
Base de datos: Supabase PostgreSQL
Autenticación: Supabase Auth
Hosting: Vercel
Control de versiones: Git + GitHub
Editor: VS Code
Asistente: Codex
```

## Principio de diseño

La app debe sentirse:

```text
simple + moderna + cálida + casera + confiable
```

No debe parecer una planilla ni un sistema empresarial pesado.
