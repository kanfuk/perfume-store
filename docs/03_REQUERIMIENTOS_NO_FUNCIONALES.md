# 03 - Requerimientos no funcionales

## RNF-01 - Usabilidad

La aplicación debe ser fácil de usar desde celular y computador.

Criterios:

- Formulario cliente debe completarse en menos de un minuto.
- Botones grandes.
- Textos claros.
- Total visible antes de enviar.
- Panel admin con acciones rápidas.

## RNF-02 - Diseño responsive

La app debe funcionar en:

- Celulares.
- Tablets.
- Computadores.

Prioridad: mobile-first.

## RNF-03 - Rendimiento

Para el MVP, la app debe soportar sin problema cerca de 50 clientes diarios.

Criterios:

- Evitar consultas innecesarias.
- Cargar solo productos activos en formulario.
- Mantener vistas simples.
- No usar librerías pesadas sin necesidad.

## RNF-04 - Mantenibilidad

El código debe estar separado por responsabilidad:

```text
components/   UI
app/          rutas y páginas
domain/       clases y reglas puras
services/     lógica de negocio
repositories/ acceso a datos
lib/          helpers y constantes
```

## RNF-05 - Seguridad

Criterios mínimos:

- Panel admin con autenticación.
- Variables sensibles en `.env.local`.
- `.env.example` sin claves reales.
- No exponer service role key en frontend.
- RLS activo en Supabase.
- Validaciones en frontend y lógica de negocio.

## RNF-06 - Calidad

El sistema debe tener:

- Código legible.
- Nombres claros.
- Funciones pequeñas.
- Estados controlados.
- QA por módulo.
- Pruebas manuales documentadas.

## RNF-07 - Escalabilidad inicial

Debe permitir en el futuro:

- Más productos.
- Reportes más completos.
- WhatsApp automático.
- Costeo por receta.
- Más usuarios admin.

Sin reescribir todo desde cero.
