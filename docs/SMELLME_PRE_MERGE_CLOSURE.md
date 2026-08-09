# Smellme.cl — cierre técnico previo al merge

Este documento registra el cierre de PR #2. No autoriza merge, Production
ni tag; esas acciones requieren una instrucción posterior explícita.

## APROBADO

- [x] Branding final Smellme consistente en tienda, Admin, login, favicon,
  PWA y metadata.
- [x] Top 15 híbrido/configurable aplicado; configuración remota permanece
  `MANUAL / 90`.
- [x] Perfiles `OWNER` / `ADMIN`, invitación sin autorregistro público y
  estados explícitos `PENDING_INVITATION`, `ACTIVE`, `INACTIVE`.
- [x] QA humano real de invitación, set-password, onboarding y acceso ADMIN
  aprobado.
- [x] Sesión implicit de invitación consumida en `/admin/set-password`, hash
  eliminado y tokens ausentes de logs y endpoints propios.
- [x] `onboarding_completed_at` exigido tanto por Next.js como por
  `public.is_active_admin()` en la barrera RLS.
- [x] OWNER único, histórico e inmutable en UI, API, servicio e invariant DB;
  todos los demás perfiles operativos permanecen ADMIN.
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

- [ ] Mantener PR #2 en Draft hasta recibir instrucción explícita para marcar
  Ready. No fusionar `main`, desplegar Production ni crear tag/release en este
  hotfix.
