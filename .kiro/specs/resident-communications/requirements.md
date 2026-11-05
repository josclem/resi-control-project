# Comunicados por correo a residentes

## Objetivo

Permitir que administradores envíen avisos o promociones por correo a residentes registrados, aunque no tengan una cuenta de usuario en Resi Control.

## Actores y permisos

- Solo `ADMINISTRADOR` y `SUPER_ADMINISTRADOR` pueden consultar destinatarios, registrar consentimientos, enviar comunicados y consultar el historial.
- La baja promocional es pública y no requiere iniciar sesión.
- Los destinatarios se limitan a residentes de la residencia activa; visitantes y residentes de otras residencias quedan excluidos.

## Requisitos funcionales

1. La selección permite incluir todos los residentes con correo, solo activos o solo inactivos, o escoger registros individuales.
2. Se puede filtrar por nombre, documento, correo, tipo y número de torre/interior y apartamento.
3. La elegibilidad no depende de que el residente tenga una cuenta del portal.
4. Los avisos administrativos pueden enviarse a residentes activos e inactivos sin consentimiento promocional.
5. Las promociones se envían únicamente cuando existe consentimiento explícito vigente para la dirección de correo actual. Se muestran y contabilizan los registros excluidos por falta de consentimiento.
6. La administración puede registrar o retirar el consentimiento y conservar la fuente o evidencia. Todo cambio queda en el historial de eventos.
7. Un cambio de correo invalida el consentimiento asociado a la dirección anterior.
8. Si varias fichas elegibles comparten dirección, se envía un solo mensaje individual a esa dirección y el historial conserva las fichas asociadas. No se usa CC ni BCC.
9. Cada intento registra estado y resultado por dirección. Un fallo SMTP no se presenta como enviado y los resultados parciales se conservan.
10. Los correos promocionales incluyen un enlace de baja con token aleatorio. La baja requiere confirmación manual y afecta solo las fichas asociadas a ese destinatario que todavía tengan consentimiento para ese correo.
11. El historial conserva tipo, asunto, mensaje, audiencia, creador, fecha y resultado por destinatario.
12. La aplicación no fija un máximo de destinatarios de campaña; los límites y rechazos del proveedor SMTP deben mostrarse como fallos por destinatario.

## Criterios de aceptación

- Un administrador envía un aviso a una ficha sin cuenta del portal y puede consultar el resultado.
- La selección por nombre, documento, correo y ubicación coincide con las mismas fichas al enviar.
- Una campaña para activos e inactivos respeta filtros y selección individual.
- Un correo repetido recibe una sola copia y queda asociado a sus fichas elegibles.
- Una promoción excluye fichas sin consentimiento, con consentimiento retirado o cuyo correo haya cambiado.
- Una baja pública no requiere autenticación y registra el retiro de consentimiento sin afectar fichas no asociadas.
- Un rechazo SMTP queda como fallo y se refleja en el estado parcial o fallido de la campaña.

## Validación y despliegue

- Validar compilación de API y frontend, typecheck de pruebas y pruebas unitarias.
- Las pruebas de integración requieren `DATABASE_URL_TEST` apuntando exclusivamente a `resi_control_test`.
- Sincronizar el esquema solo en una base de pruebas aislada; no ejecutar `db:push` con la URL de desarrollo o producción.
- Configurar SMTP en el entorno de la API y `WEB_APP_URL` para construir el enlace público de baja.
