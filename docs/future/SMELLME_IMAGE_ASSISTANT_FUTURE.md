# Asistente de imágenes — trabajo futuro

## Estado

El asistente basado en búsqueda externa no forma parte de Smellme MVP V2. Su interfaz,
rutas API, proveedor externo, variables de entorno y pruebas de ejecución fueron retirados.
La carga manual de imágenes sigue siendo el único flujo operativo: valida JPEG/PNG/WebP,
normaliza a WebP y guarda bajo `product-images/products/{productId}/`.

La migración histórica `20260804000000_safe_image_assistant_history.sql` se conserva porque
ya pertenece al historial inmutable de base de datos. Ningún código del MVP la consume.

## Condiciones para una fase futura

Una eventual reactivación requiere una decisión de producto independiente, evaluación legal
de licencias y atribución, allowlist explícita de fuentes oficiales, protección SSRF,
límites de tamaño/tiempo/MIME, revisión humana obligatoria, idempotencia, trazabilidad y un
canary reversible. Las credenciales deberán existir solo en servidor y la funcionalidad
deberá permanecer apagada por defecto.

No se debe reutilizar automáticamente una imagen obtenida por búsqueda ni reemplazar una
imagen manual. El administrador debe poder previsualizar la procedencia y aprobar cada
cambio. La implementación futura tendrá su propia migración y plan de rollback.
