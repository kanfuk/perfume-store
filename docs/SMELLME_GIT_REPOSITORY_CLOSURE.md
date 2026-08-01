# Cierre de repositorios, worktrees y ramas de Smellme.cl

Fecha: 2026-07-31.

## Resultado ejecutivo

- Repositorio operativo: `D:\DESARROLLO SOFTWARE\perfume-store`.
- Rama de cierre y rama activa: `feature/image-source-reconciliation`.
- HEAD auditado antes de este documento: `222c1508dd1fa1643bbe81460e2daf520d63d0da`.
- Upstream: `origin/feature/image-source-reconciliation`, sincronizado 0 ahead / 0 behind.
- `main` local y `origin/main`: `65fc1755b17bc5b66c026114b4dc87922a027aab`, intactas.
- Working tree inicial: limpio.
- Worktrees registrados antes y después: uno, el repositorio principal.
- Directorios operativos finales de Smellme.cl: sólo el repositorio principal.
- Ramas locales: 9 antes, 2 después.
- Ramas remotas eliminadas: ninguna.
- Referencias remotas obsoletas podadas: ninguna; el dry-run y la poda de `origin` no encontraron referencias eliminadas en servidor.

## Carpeta secundaria

Ruta: `D:\DESARROLLO SOFTWARE\smellme-price-mode-remote`.

Clasificación durante la auditoría: **E, carpeta temporal residual con contenido de proyecto integrado**.

La carpeta:

- existe, pero no contiene `.git`;
- no es un repositorio, clon funcional ni worktree registrado;
- no aparece en `git worktree list --porcelain`;
- no tiene rama, HEAD, upstream, bloqueo ni estado prunable asociados;
- contiene únicamente `supabase/`: 16 archivos de proyecto y 8 archivos ignorados bajo `supabase/.temp`;
- tiene 15 archivos de proyecto idénticos al repositorio principal;
- conserva un `supabase/schema.sql` más antiguo cuyo blob coincide exactamente con el commit alcanzable `08495f8` (`feat(pricing): add automatic and manual quick price editing`);
- contiene la migración `20260729020000_smellme_price_mode.sql`, idéntica a la integrada en el repositorio principal;
- no contiene commits ni archivos de proyecto únicos.

Siete archivos de `supabase/.temp` coinciden con el repositorio principal y uno difiere. Son estado local ignorado, no código ni historial Git. No se inspeccionaron ni documentaron sus valores.

Decisión inicial: no retirarla sin autorización porque `git worktree remove` no era aplicable y existía cache ignorado de `supabase/.temp`.

Estado posterior a la autorización: el usuario autorizó expresamente su eliminación. Durante la comprobación obligatoria inmediatamente anterior al borrado, la ruta ya no existía. Por tanto, Codex no ejecutó ningún comando de eliminación. Se confirmó que `D:\DESARROLLO SOFTWARE` contiene únicamente `perfume-store` entre los directorios relacionados y que Git sigue registrando sólo el worktree principal.

## Worktrees

| Momento | Ruta | Rama | HEAD | Estado |
|---|---|---|---|---|
| Antes | `D:\DESARROLLO SOFTWARE\perfume-store` | `feature/image-source-reconciliation` | `222c1508` | Limpio, registrado, principal |
| Después | `D:\DESARROLLO SOFTWARE\perfume-store` | `feature/image-source-reconciliation` | `222c1508` | Limpio, único worktree registrado |

`git worktree prune --verbose` no encontró entradas huérfanas. La carpeta secundaria nunca figuró como worktree. En la verificación final posterior a la autorización ya estaba ausente.

## Inventario de ramas locales inicial

Todas las ramas tenían upstream, estaban 0/0 respecto de éste y eran ancestros de la rama de cierre. La columna “detrás” indica cuántos commits de cierre faltaban en el puntero histórico, no trabajo perdido.

| Rama | HEAD | Upstream | Ahead/behind upstream | Detrás de cierre | Worktree | Decisión |
|---|---:|---|---:|---:|---|---|
| `feature/image-source-reconciliation` | `222c1508` | `origin/feature/image-source-reconciliation` | 0/0 | 0 | Principal | CONSERVAR, activa y cierre MVP V2 |
| `main` | `65fc1755` | `origin/main` | 0/0 | 30 | Ninguno | CONSERVAR, rama protegida |
| `feature/safe-image-assistant-and-full-qa` | `71d3ba1b` | rama homónima de `origin` | 0/0 | 1 | Ninguno | ELIMINABLE_LOCAL |
| `feature/final-mvp-audit` | `395b93f6` | rama homónima de `origin` | 0/0 | 2 | Ninguno | ELIMINABLE_LOCAL |
| `feature/product-image-upload` | `2603109a` | rama homónima de `origin` | 0/0 | 3 | Ninguno | ELIMINABLE_LOCAL |
| `feature/direct-sale-fast-flow` | `c75b3242` | rama homónima de `origin` | 0/0 | 4 | Ninguno | ELIMINABLE_LOCAL |
| `feature/order-operations-flow` | `55788da8` | rama homónima de `origin` | 0/0 | 5 | Ninguno | ELIMINABLE_LOCAL |
| `feature/admin-control-center-polish` | `1bc434a0` | rama homónima de `origin` | 0/0 | 6 | Ninguno | ELIMINABLE_LOCAL |
| `feature/perfume-store-foundation` | `00d6a4ae` | rama homónima de `origin` | 0/0 | 7 | Ninguno | ELIMINABLE_LOCAL |

La rama `feature/mvp-v2-cleanup-and-release` no existe local ni remotamente. La historia demuestra que `feature/image-source-reconciliation` es la rama vigente más avanzada: todas las ramas revisadas son ancestros, sus rangos inversos están vacíos y `git cherry` no encontró commits equivalentes pendientes.

## Limpieza local ejecutada

Antes de cada operación se verificó `git merge-base --is-ancestor <rama> feature/image-source-reconciliation`, upstream existente y sincronización 0/0. Se usó exclusivamente `git branch -d`, sin `-D`.

Ramas locales retiradas:

1. `feature/admin-control-center-polish`
2. `feature/direct-sale-fast-flow`
3. `feature/final-mvp-audit`
4. `feature/order-operations-flow`
5. `feature/perfume-store-foundation`
6. `feature/product-image-upload`
7. `feature/safe-image-assistant-and-full-qa`

Ramas locales conservadas:

- `feature/image-source-reconciliation`
- `main`

## Ramas remotas conservadas

No se borró ninguna rama del servidor. Se conservaron `origin/main`, `origin/feature/image-source-reconciliation` y las siete ramas históricas homónimas retiradas sólo en local. Se clasifican como **CONSERVAR_HASTA_RELEASE** porque documentan hitos y permiten rollback hasta que MVP V2 llegue a producción.

También se conservó `pauli-source/main`, que apunta al mismo commit que `main`. No se cambió la configuración de ningún remoto.

## Integridad

- `git fsck --full`: sin corrupción y sin commits dangling; reportó únicamente 6 blobs y 5 trees dangling procedentes de actividad local histórica.
- No se ejecutó `git gc`, poda de objetos ni mantenimiento agresivo.
- `git count-objects -vH`: 1051 objetos sueltos (3.36 MiB), 1705 en un pack (31.89 MiB), 0 garbage y 0 bytes de garbage.
- No hay worktrees huérfanos registrados.
- Ningún commit se perdió: las ramas remotas históricas permanecen y sus HEAD son alcanzables desde la rama de cierre.
- `next-env.d.ts` permanece intacto.

## Recomendaciones posteriores al release V2

1. Mantener las ramas remotas históricas hasta validar producción y completar el período de rollback.
2. Tras esa validación, revisar y aprobar por separado cualquier eliminación remota; no hacerlo como parte de esta fase.
3. No recrear `D:\DESARROLLO SOFTWARE\smellme-price-mode-remote`; usar el repositorio principal o un worktree registrado para cualquier trabajo futuro.
4. Ejecutar `git maintenance run --auto` únicamente si Git lo recomienda. No es necesario un GC agresivo con el estado actual.
