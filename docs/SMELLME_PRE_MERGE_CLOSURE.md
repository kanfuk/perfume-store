# Smellme.cl — cierre técnico previo al QA de invitación ADMIN

Este documento es el gate de cierre de PR #2. No autoriza merge, Production
ni tag. El único bloqueo humano restante es el onboarding real descrito en
`PENDIENTE`.

## APROBADO

- [x] Branding final Smellme consistente en tienda, Admin, login, favicon,
  PWA y metadata.
- [x] Top 15 híbrido/configurable aplicado; configuración remota permanece
  `MANUAL / 90`.
- [x] Perfiles `OWNER` / `ADMIN`, invitación sin autorregistro público y
  estados explícitos `PENDING_INVITATION`, `ACTIVE`, `INACTIVE`.
- [x] Sesión implicit de invitación consumida en `/admin/set-password`, hash
  eliminado y tokens ausentes de logs y endpoints propios.
- [x] `onboarding_completed_at` exigido tanto por Next.js como por
  `public.is_active_admin()` en la barrera RLS.
- [x] OWNER-only en navegación desktop/móvil, página, APIs y servicios de
  Usuarios; protección contra autodesactivación, autodegradación y último
  OWNER activo.
- [x] Cuenta de cobro 1:1 por ADMIN; OWNER sin cuenta propia y con selector
  explícito de receptor.
- [x] Un ADMIN solo resuelve su propia cuenta server-side; cuenta ausente o
  inactiva bloquea únicamente el mensaje de transferencia.
- [x] Listados con número enmascarado; cuentas completas y snapshots sin
  endpoints públicos y con `Cache-Control` privado/no-store.
- [x] Bitácora inmutable `admin_payment_message_audits` con operador, receptor,
  cuenta, fecha y snapshot histórico.
- [x] Supabase remoto alineado, sin seeds/reset/repair, sin cuentas ni audits
  inventados y sin datos comerciales modificados.
- [x] `nanoid` actualizado de forma mínima a una versión corregida;
  `npm audit --production` sin vulnerabilidades.
- [x] Lint, typecheck, suite completa, build, diff-check y Preview smoke
  aprobados sin respuestas 500.
- [x] PR #2 permanece Draft, `MERGEABLE` y sin conflicto con `main`.

## PENDIENTE

Único gate humano por completar, respetando el rate limit real de Supabase:

1. [ ] OWNER invita un ADMIN real.
2. [ ] OWNER confirma estado `PENDING_INVITATION`.
3. [ ] El invitado recibe y abre un email nuevo.
4. [ ] El enlace abre `/admin/set-password` con sesión válida.
5. [ ] La contraseña se guarda y completa el onboarding.
6. [ ] El ADMIN inicia sesión correctamente.
7. [ ] El OWNER ve el perfil en estado `ACTIVE`.
8. [ ] El ADMIN no ve ni accede a Usuarios.
9. [ ] El OWNER configura la cuenta bancaria del ADMIN.
10. [ ] Se confirma que la cuenta quedó asociada al ADMIN correcto.

Después de aprobar los diez puntos, y no antes: marcar PR Ready, fusionar a
`main`, validar `main`, desplegar Production, ejecutar smoke de Production y
crear tag/release.
