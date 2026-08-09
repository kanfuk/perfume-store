# Administradores por invitación

Smellme.cl no ofrece registro público. Un `OWNER` autorizado abre
`/admin/usuarios`, indica nombre, correo y rol (`OWNER` o `ADMIN`) y Supabase
Auth envía el enlace. La contraseña la define el invitado en
`/admin/set-password`; nunca pasa por formularios, logs o tablas propias.

La identidad vive en Supabase Auth y la autorización en `usuarios_admin`. Un
usuario inactivo o sin esa fila activa no puede operar el panel, aunque tenga
una sesión Auth válida. Tampoco puede operar mientras
`onboarding_completed_at` sea `NULL`: esa marca se completa server-side sólo
después de que el propio invitado define su contraseña. Las rutas de gestión validan `OWNER`, origen, JSON,
correo y rol en servidor. La base impide desactivar, degradar o eliminar al
último OWNER activo.

## Opción futura — no implementada

Una fase posterior puede agregar “Solicitar acceso”: la persona enviaría una
solicitud sin obtener permisos; un OWNER tendría que aprobarla y recién entonces
se enviaría la invitación. Este repositorio no expone hoy ese formulario ni una
ruta de autorregistro.
