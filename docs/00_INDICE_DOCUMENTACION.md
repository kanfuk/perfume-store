# 00 - Indice de documentacion Pauli Store

Este indice ordena los documentos del proyecto para mantener implementacion, QA y despliegue alineados.

## Objetivo del set documental

Guiar el desarrollo de **Pauli Store** con documentacion clara, separada por temas y pensada para construir y pulir el sistema por fases.

## Archivos incluidos

| Archivo | Proposito |
|---|---|
| `01_VISION_GENERAL.md` | Explica objetivo, alcance, usuarios y stack. |
| `02_REQUERIMIENTOS_FUNCIONALES.md` | Define que debe hacer el sistema. |
| `03_REQUERIMIENTOS_NO_FUNCIONALES.md` | Define calidad, rendimiento, usabilidad y mantenibilidad. |
| `04_FLUJO_NEGOCIO_ESTADOS.md` | Define estados de pedido, pago y reglas de transicion. |
| `05_FORMULARIO_CLIENTE_UX_IX.md` | Define el formulario publico, diseno y experiencia del cliente. |
| `06_PANEL_ADMINISTRADOR.md` | Define las pantallas del panel privado. |
| `07_MODELO_DATOS.md` | Define tablas, campos y relaciones. |
| `08_DISENO_POO.md` | Define clases, herencia, polimorfismo y responsabilidades. |
| `09_SERVICIOS_REPOSITORIOS.md` | Define separacion entre logica de negocio y acceso a datos. |
| `10_SEGURIDAD_HEADERS_RLS.md` | Define seguridad, headers, variables de entorno y RLS. |
| `11_QA_PLAN_PRUEBAS.md` | Checklist QA y casos de prueba. |
| `12_ISO_BUENAS_PRACTICAS.md` | Buenas practicas adaptadas al proyecto. |
| `13_ROADMAP_IMPLEMENTACION.md` | Orden de construccion por fases. |
| `14_PROMPTS_CODEX.md` | Prompts listos para usar en Codex. |
| `15_CRITERIOS_ACEPTACION.md` | Condiciones para considerar terminado el MVP. |
| `26_ESTADO_FINAL_UX_RESPONSIVE_AVANCES.md` | Estado del pulido UX responsive en cliente y admin. |
| `27_PULIDO_FINAL_RENDER_SCROLL_ICONO.md` | Diagnostico final y correcciones de favicon, scroll movil y fechas admin. |
| `28_CIERRE_MENSUAL_Y_LIMPIEZA_PRELANZAMIENTO.md` | Flujo de cierre mensual, archivado operativo y limpieza de datos de prueba. |
| `28_VENTA_DIRECTA_PEDIDO_PERSONALIZADO_PRODUCTOS_LIMPIEZA.md` | Venta directa, pedido personalizado, catalogo ampliado y cierre tecnico. |
| `29_AJUSTES_FINALES_ADMIN_PRODUCTOS_QA.md` | Ajustes finales de navegacion admin, catalogo, fotos y QA final. |
| `30_SCROLL_INTERNO_WHATSAPP_FLOATING_QA.md` | Diagnostico y correcciones del scroll interno admin mas boton flotante de WhatsApp. |
| `31_ELIMINA_NAVBAR_INFERIOR_ADMIN_UX_FINAL.md` | Retiro de la navbar inferior admin y ajustes finales de espaciado mobile. |
| `33_FASE_FINAL_WHATSAPP_CONFIRMACION_PEDIDOS.md` | Arquitectura y flujo de confirmacion manual de pedidos por WhatsApp. |
| `34_CHECKLIST_QA_WHATSAPP_CONFIRMACION.md` | Checklist tecnico, funcional y responsive para validar la integracion de WhatsApp. |
| `35_WHATSAPP_AUTO_AGENDA_PEDIDOS.md` | Apertura automatica de WhatsApp al agendar pedidos manteniendo el boton manual. |
| `36_CHECKLIST_QA_WHATSAPP_AUTO_AGENDA.md` | Checklist de validacion para la apertura automatica de WhatsApp al agendar. |
| `37_ESTADO_ACTUAL_APP_2026_06_23.md` | Estado operativo actual: branding, UX mobile, panel admin, stock unificado y despliegue vigente. |
| `38_ESTADO_ACTUAL_APP_2026_06_24.md` | Estado final vigente tras badge PWA iPhone, contador admin, limpieza de repo y unificacion de assets. |
| `39_PRELANZAMIENTO_OPERATIVO_2026_06_24.md` | Resultado de la pasada final sobre produccion, Supabase, seguridad visible y checklist de cierre operativo. |
| `40_ESTADO_ACTUAL_APP_2026_06_25.md` | Estado vigente tras ajustes de fiados agrupados, clientes existentes, cobro WhatsApp y cierre documental del fix final. |
| `41_BADGES_PWA_LIMITACIONES.md` | Estado vigente del badge admin, Web Push y limites reales de iPhone/PWA. |
| `42_WEB_PUSH_PWA_ROADMAP.md` | Base implementada de Web Push admin y siguientes endurecimientos recomendados. |
| `43_ESTADO_ACTUAL_APP_2026_06_26.md` | Estado vigente tras seguridad CSP compatible, Web Push admin y cierre documental actualizado. |
| `PROMPT_CODEX_INTEGRAR_ICONOS.md` | Prompt operativo para reinstalar o revisar el pack de iconos de Pauli Store. |

## Instruccion general para Codex

Leer primero este indice. Si la tarea es sobre el sistema actual, revisar `43_ESTADO_ACTUAL_APP_2026_06_26.md`, luego `10_SEGURIDAD_HEADERS_RLS.md` y `18_DEPLOY_VERCEL.md` antes de navegar por documentos historicos. No inventar estados, modulos ni reglas que no esten documentadas.
