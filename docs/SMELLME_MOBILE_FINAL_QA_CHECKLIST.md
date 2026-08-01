# Checklist final — teléfono real

Usar únicamente el Preview indicado en la entrega. No probar en producción ni ingresar datos
personales reales. Crear un pedido temporal con prefijo `ZZTEST-QA-MOBILE-FINAL` sólo si se
autoriza un nuevo ciclo, y ejecutar después el reset protegido.

## Flujo obligatorio

1. Iniciar sesión desde el celular.
2. Abrir un pedido de prueba.
3. Pulsar `Reenviar datos de pago`.
4. Confirmar que la aplicación muestra el bottom sheet y no una pantalla blanca.
5. Pulsar `Abrir WhatsApp`.
6. Regresar a Smellme.cl y verificar que el pedido sigue visible.
7. Pulsar `Copiar mensaje` y confirmar el aviso de copia.
8. Cerrar el panel y comprobar que el scroll vuelve a funcionar.
9. Confirmar el pago una sola vez.
10. Verificar `Pago confirmado correctamente`.
11. Pulsar `Enviar confirmación por WhatsApp`.
12. Volver y continuar con Preparando, Despachado y Entregado.
13. Usar Atrás en el navegador y confirmar que no aparece una pestaña vacía.
14. Pulsar `Compartir mi tiendita`.
15. Verificar que el mensaje conserva el saludo e incluye el home del Preview.
16. Abrir ese home y confirmar que carga el catálogo público vacío sin error técnico.

## Evidencia a registrar sin datos privados

- dispositivo, sistema y navegador;
- resultado sí/no de cada paso;
- pantallas blancas: debe ser 0;
- errores de consola/500: debe ser 0;
- loading bloqueado: debe ser 0;
- enlace raíz correcto: sí;
- navegación de regreso: sí;
- copia manual: sí.

No guardar screenshots con datos de clientes, mensajes bancarios ni URLs completas de WhatsApp en
el repositorio.
