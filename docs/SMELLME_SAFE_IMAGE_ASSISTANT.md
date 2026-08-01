# Smellme.cl — Asistente seguro de imágenes

Fecha de validación: 2026-07-31. Rama:
`feature/safe-image-assistant-and-full-qa`.

## Resultado

Se implementó `/admin/catalogo/imagenes` como flujo mobile-first e incremental.
Seleccionar el CSV no escribe en Storage ni en la base: el primer paso es
siempre un dry-run. La navegación de Gestión de catálogo incluye ahora el
acceso **Imágenes** y el resumen ofrece una acción rápida.

El dry-run real utilizó el CSV privado ya existente en `.local-import/`
(Windows-1252, `;`, 101 filas útiles) y el catálogo remoto actual. El informe
completo quedó en `.local-work/safe-image-assistant-dry-run.json`, ruta
ignorada por Git.

| Clasificación | Total |
|---|---:|
| Total catálogo | 106 |
| Sin imagen inicial | 102 |
| `AUTO_SEGURO` | 0 |
| `REQUIERE_REVISION` | 39 |
| `YA_TIENE_IMAGEN` | 4 |
| `SIN_FUENTE_SEGURA` | 61 |
| `EXCLUIDO_QA` | 2 |
| `ERROR` | 0 |

La referencia administrativa era aproximadamente 28 productos en revisión.
El motor reconstruyó 39: diferencia 11. Las razones predominantes fueron 22
inconsistencias de nombre, 19 posibles duplicados, 5 inconsistencias de marca
y 5 conflictos de marca dentro del catálogo (un producto puede acumular más
de una razón). Como la diferencia supera cinco, el servidor bloquea cualquier
subida de lote. No se forzó la cifra de 28.

## Criterio de seguridad

Cada producto termina exactamente en `AUTO_SEGURO`, `REQUIERE_REVISION`,
`YA_TIENE_IMAGEN`, `SIN_FUENTE_SEGURA`, `EXCLUIDO_QA` o `ERROR`. El conjunto
protegido se reconstruye desde el CSV, el catálogo remoto y el motor de
calidad. Se excluyen productos incompletos, pausados, `ZZTEST-*`, duplicados,
variantes no inequívocas, marcas o nombres inconsistentes, contenido no
estándar, palabras ambiguas y cualquier producto que ya tenga imagen.

El score es explicable: marca 25, nombre 30, concentración 20, contenido 10,
fuente aprobada 10 e imagen de producto 5. `AUTO_SEGURO` exige al menos 95,
exactamente un candidato y cero contradicciones. En la implementación actual
las seis verificaciones son obligatorias, por lo que un candidato automático
válido obtiene 100.

## Fuentes y proveedor

La búsqueda usa un proveedor explícitamente configurado en servidor. El
contrato recibe marca, nombre, contenido y concentración, y devuelve URL de
imagen, página de origen, autoridad declarada y metadata de identidad. Los
hosts deben coincidir exactamente con `SAFE_IMAGE_ALLOWED_DOMAINS`; no se
aceptan subdominios implícitos. Cada candidato se firma en servidor antes de
volver al navegador y la firma se verifica otra vez al procesarlo.

En esta ejecución no estaban configurados proveedor, credencial, secreto de
firma ni dominios aprobados. Por eso no se consultó la web, no se afirmó que
ninguna fuente fuera oficial y las 61 identidades conciliadas quedaron como
`SIN_FUENTE_SEGURA`. Fuentes efectivamente utilizadas: ninguna.

## Descarga y SSRF

Solo se acepta HTTPS en puerto 443, sin credenciales en URL. Se rechazan IPs
literales, localhost, loopback, redes privadas, carrier-grade NAT, link-local,
metadata cloud, multicast/reservadas e IPv6 local/privada. Todos los resultados
DNS deben ser públicos; la conexión se fija a la IP ya validada manteniendo
SNI/Host del dominio. Cada redirect se resuelve y valida nuevamente contra la
allowlist.

La descarga tiene timeout, máximo 10 MiB y máximo tres redirects. Se cotejan
`Content-Type`, magic bytes y decodificación real con Sharp. Se rechazan
formatos no admitidos y dimensiones fuera de 300–10.000 px. La imagen válida
pasa por `processProductImage`: rotación EXIF, proporción preservada, máximo
1600 px, WebP calidad 86, sin upscale.

## Procesamiento e idempotencia

El navegador procesa como máximo dos productos simultáneos y realiza una
solicitud por producto. Puede detenerse; al reanalizar, una imagen ya aplicada
queda como `YA_TIENE_IMAGEN` y no vuelve a procesarse. El historial remoto usa
producto, URL normalizada, SHA-256, score, razones y estado final. Una URL no
duplica intentos del mismo producto y un hash aplicado no puede reutilizarse
en otro producto.

Antes de escribir se reejecutan conciliación, score, firma, allowlist, DNS y
validación binaria. El servicio `asignarImagenProductoSiAusente` se niega a
reemplazar imágenes existentes y luego reutiliza el pipeline/rollback de la
carga manual. No modifica nombre, marca, contenido, SKU, costo, precio, stock,
activo, Top 12 ni ofertas.

## Canary y lote

La UI confirma el total, procesa primero hasta cinco productos y se detiene
para revisión visual. Solo tras la confirmación humana permite continuar con
el resto. En esta ejecución el canary y el lote real no se iniciaron por dos
guardas independientes: diferencia de conciliación 11 y ausencia de fuentes
configuradas. Imágenes subidas: 0. Duplicados modificados: 0. Productos en
auditoría modificados: 0. Pendientes manuales actuales: 39, más 61 sin fuente
segura.

## Operación recomendada

1. Resolver o aceptar explícitamente las 39 filas de revisión hasta reconciliar
   la diferencia con el conjunto administrativo.
2. Aprobar legal y comercialmente dominios fuente y configurar las cuatro
   variables de servidor documentadas en `.env.example`.
3. Repetir dry-run, revisar el informe y confirmar que la diferencia sea ≤5.
4. Buscar candidatos, revisar previews WebP servidas por proxy seguro y lanzar
   el canary de cinco.
5. Verificar botella, concentración, contenido, ausencia de marca de agua,
   Storage, DB y catálogo público antes de continuar el lote.

No se desplegó producción ni se modificó `main`.
