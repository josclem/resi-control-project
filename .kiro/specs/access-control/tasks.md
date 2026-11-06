# Tareas: Control de acceso residencial

Estado: el MVP de gestión y registro de accesos está implementado. Continúa la validación final de portería y del piloto; el hardware biométrico queda para una fase posterior.

## Completado

- [x] Crear monorepo TypeScript con API Express, frontend React y Prisma/PostgreSQL.
- [x] Implementar autenticación JWT y perfiles de superadministrador, administrador y vigilante.
- [x] Implementar administración de usuarios y roles personalizados con permisos por residencia.
- [x] Implementar invitación por email de personas residentes registradas, activación con contraseña propia y asociación única entre cuenta y residente.
- [x] Implementar el portal web de residentes para crear y consultar sus prerregistros de visita.
- [x] Agregar vigencia configurable con calendario y hora, desde la hora actual hasta medianoche por defecto.
- [x] Permitir observaciones opcionales (hasta 500 caracteres) en visitas de residentes y registros de portería.
- [x] Permitir cancelación por el residente antes del ingreso y marcar como `NOSHOW` las visitas vencidas sin entrada.
- [x] Permitir a portería registrar una visita autorizada externamente, guardar origen/operador y vincular sus movimientos de entrada y salida.
- [x] Configurar envío SMTP mediante variables de entorno, compatible con Gmail y contraseña de aplicación.
- [x] Implementar selección de residencia para el superadministrador y aislamiento entre residencias.
- [x] Gestionar residentes, visitantes y vehículos, incluidas fotos y desactivación lógica.
- [x] Registrar entradas y salidas peatonales y vehiculares, con historial y tablero de movimientos recientes.
- [x] Implementar reglas para movimientos irregulares: bloqueo o autorización de supervisor.
- [x] Generar credenciales QR y códigos de barras, y admitir lectura mediante cámara o lector USB.
- [x] Implementar configuración de residencia, logo y modo de captura.
- [x] Implementar registro, consulta, entrega y devolución de encomiendas.
- [x] Agregar pruebas automatizadas de permisos, aislamiento por residencia, movimientos y encomiendas.
- [x] Verificar compilación de API y frontend con `npm run build`.

## Validación manual realizada (2026-11-04)

- [x] Probar desde el navegador la interfaz y el flujo de acceso en `resi_control_test`, sin modificar la base local de desarrollo.
- [x] Registrar residente y visitante; confirmar entradas y salidas peatonales y vehiculares en el tablero.
- [x] Confirmar que un movimiento peatonal repetido se bloquea y no crea otro registro.
- [x] Cambiar el modo a autorización de supervisor, comprobar que el formulario conserva persona y tipo de movimiento, y autorizarlo; se agregó un solo movimiento.
- [x] Crear una encomienda, verla en la lista, entregarla con nombre de quien la retira y devolver otra.
- [x] Enviar un código desconocido de 32 caracteres al endpoint de lectura; la API respondió `404` con `Código no reconocido.`.
- [x] Abrir la administración de usuarios y roles desde la interfaz.

La prueba del código desconocido validó la respuesta de la API, no la lectura física de un QR antiguo. No se contó con webcam de enfoque automático ni lector USB; ambas pruebas físicas siguen pendientes. La autorización se probó en el formulario manual, no durante un escaneo físico.

Validación manual de invitaciones (2026-11-04), en la base aislada:

- [x] Comprobar desde la interfaz la lista de residentes disponibles para invitar.
- [x] Confirmar que SMTP sin configurar devuelve un error visible y no crea una invitación pendiente.
- [x] Abrir un enlace de activación, establecer contraseña, iniciar sesión y verificar la pantalla de residente.
- [x] Limpiar los registros temporales de prueba.

La cuenta Gmail y la contraseña de aplicación ya se configuraron localmente en `apps/api/.env` (no se versionan). `verify()` y el envío de una invitación de prueba pasaron con Avast temporalmente desactivado; el residente recibió el mensaje y activó su cuenta. No se deshabilitó la validación TLS.

Build y suites automatizadas, también ejecutadas el 2026-11-04:

- `npm run build`: correcto; Vite conserva la advertencia de bundle mayor a 500 kB.
- `npm test`: correcto, 5 archivos y 15 pruebas.
- Suite completa de integración de API: correcta, 4 archivos y 19 pruebas, usando exclusivamente `resi_control_test`.

## Próximos pasos

- [ ] Probar el QR impreso con una webcam adecuada y el código de barras con un lector USB; repetir entonces la autorización de supervisor desde el flujo de escaneo.
- [ ] Reproducir e investigar el movimiento duplicado reportado para Jose Rojas antes de modificar su historial.
- [ ] Probar desde navegador los flujos nuevos de residente y portería.
- [ ] Definir zona horaria oficial de la residencia; la UI actualmente usa la zona local del navegador.
- [ ] Evaluar filtros y exportación de reportes de acceso.
- [ ] Definir política de edición y anulación de movimientos, conservando el historial auditable.
- [ ] Validar el flujo de portería con vigilantes y administradores y conseguir un conjunto para piloto.
- [ ] Definir el canal de notificación al residente cuando llega una visita o encomienda.
- [x] Probar la entrega de una invitación a un destinatario autorizado sin desactivar la validación TLS.
- [ ] Publicar frontend y API bajo HTTPS antes de invitar residentes reales.

## Dependiente de hardware o de una decisión de producto

- [ ] Probar lectura real con cámara con autofoco y lector USB; la webcam actual no lee de forma confiable QR en pantalla.
- [ ] Integrar biometría y puertas cuando se conozcan fabricante, modelo, protocolo y SDK del dispositivo.
- [ ] Considerar evidencia fotográfica, intentos de entrega y reportes avanzados de encomiendas.

## Decisiones pendientes

- Política acordada: el residente autoriza, elige vigencia (desde ahora hasta medianoche por defecto), puede cancelar antes del ingreso; portería registra visitas sin prerregistro solo después de confirmar autorización externa; visitas vencidas sin entrada pasan a `NOSHOW`.
- Zona horaria oficial y formatos de exportación.
- Canal y política de notificaciones al residente.
- Hardware biométrico y de apertura de puerta.
