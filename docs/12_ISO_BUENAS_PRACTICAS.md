# 12 - Buenas prácticas inspiradas en ISO

## Nota importante

No declarar que Pauli Store está certificado ISO.

Usar esta redacción:

```text
El proyecto aplica buenas prácticas inspiradas en modelos de calidad de software, especialmente ISO/IEC 25010, ISO/IEC/IEEE 12207 e ISO 9001, adaptadas al contexto de una minipyme y desarrollo académico/práctico.
```

## ISO/IEC 25010 aplicada

| Característica | Aplicación en Pauli Store |
|---|---|
| Adecuación funcional | Registro de pedidos, agendamiento, pagos, fiados y reportes. |
| Usabilidad | Formulario simple, mobile-first y visualmente cálido. |
| Fiabilidad | Validaciones, estados controlados y cancelación automática. |
| Seguridad | Login admin, RLS, variables de entorno y headers básicos. |
| Mantenibilidad | Código modular, servicios, repositorios y dominio separado. |
| Portabilidad | App web desplegable y usable desde celular o PC. |

## ISO/IEC/IEEE 12207 aplicada

Ciclo simple:

```text
1. Requerimientos
2. Diseño
3. Implementación
4. Pruebas
5. Corrección
6. Despliegue
7. Mantenimiento
```

Cada fase debe seguir:

```text
definir -> codificar -> probar -> corregir -> documentar
```

## ISO 9001 aplicada como criterio de orden

Aplicar:

```text
control de cambios
trazabilidad
revisión antes de entregar
registro de errores
mejora continua
documentación clara
```

## Aplicación práctica por módulo

| Módulo | Buena práctica aplicada |
|---|---|
| Formulario cliente | Usabilidad y validación. |
| Panel admin | Control de proceso y trazabilidad. |
| Estados | Fiabilidad y consistencia. |
| Seguridad | Protección de acceso y datos. |
| QA | Mejora continua y control de calidad. |
| Documentación | Mantenibilidad y trazabilidad. |

## Regla para Codex

Codex debe priorizar una implementación simple, clara y testeable antes que una arquitectura demasiado avanzada.
