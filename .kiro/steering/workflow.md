# Accivia - Flujo de trabajo

## Antes de implementar

1. Leer este directorio `.kiro`.
2. Revisar [CONTEXTO_PROYECTO.md](C:/Users/klement/accivia/CONTEXTO_PROYECTO.md) para el estado funcional y técnico.
3. Revisar la spec de la funcionalidad en `.kiro/specs`:
   - `access-control`: personas, vehículos, accesos y configuración.
   - `encomiendas`: paquetes, comida, recibos y correo.
4. Confirmar si la tarea afecta modelo de datos, API, frontend o seguridad.
5. Mantener compatibilidad con PostgreSQL y Prisma.

## Durante la implementación

- Actualizar primero la spec si cambia el alcance.
- Implementar en capas: modelo de datos, API, interfaz y validación.
- Evitar integrar hardware biométrico sin documentación del dispositivo.
- No introducir datos de producción en seeds o archivos de ejemplo.
- No seguir ajustando la cámara por ahora: el tema quedó pausado por decisión del usuario.
- Mantener la interfaz en español y el código/API en inglés.

## Validación mínima

```powershell
npm run build
```

Si existe una base PostgreSQL local configurada:

```powershell
npm run db:generate
npm run db:push
npm run db:seed
```

Para cambios de API o interfaz, además:

- Probar el endpoint nuevo contra `http://localhost:4000` con un token real.
- Verificar el flujo principal en `http://localhost:5173`.
- Si no hay navegador disponible, al menos confirmar que el build y la API responden.

En Windows, si `prisma generate` falla con `EPERM`, detener solo el proceso de la API del proyecto, regenerar y volver a iniciar la API.

## Estado actual (5 de noviembre de 2026)

Completado y funcionando:

- Monorepo TypeScript con API Express, Prisma y frontend React/Vite.
- PostgreSQL local `resi_control` sincronizado; las pruebas manuales recientes se hicieron en la base aislada `accivia_test`.
- Login JWT con roles `SUPER_ADMINISTRADOR`, `ADMINISTRADOR`, `VIGILANTE` y roles personalizados con permisos por residencia.
- Administración de usuarios y roles desde la interfaz, además de aislamiento por residencia.
- Invitaciones de residentes por correo: enlace de un solo uso con vencimiento, creación de contraseña propia y asociación de la cuenta al residente registrado. El envío requiere configurar SMTP; Gmail usa contraseña de aplicación.
- Prerregistros de visitas desde el portal y registro de portería con autorización externa auditada y movimientos enlazados; cambios integrados en `main` mediante el PR #12.
- Personas: residentes y visitantes, fotos, documento, teléfono y desactivación lógica.
- Vehículos: CRUD, foto, asociación a persona y placa única por residencia.
- Movimientos de entrada/salida peatonales y vehiculares.
- Movimientos irregulares: bloquear o pedir supervisor.
- `accessCode` de 32 hex para personas y vehículos.
- QR y código de barras con descarga e impresión.
- Escaneo con cámara y lector USB, con formatos restringidos y validación de 32 hex.
- Configuración de residencia, logo y modo de captura.
- Encomiendas: registro, tipos, estados, entrega y devolución.
- Dashboard con últimos movimientos, totales y encomiendas pendientes.
- `Cache-Control: no-store` en la API.
- Validación manual en navegador: login, personas, accesos peatonales/vehiculares, bloqueo de repetidos, autorización de supervisor, encomiendas y administración de usuarios.
- Código desconocido probado contra `/api/access/scan`: responde `404` con `Código no reconocido.`.
- `npm run build`, `npm test` (15 pruebas) y pruebas de integración (19 pruebas) pasan.

Pendiente o pausado:

- La lectura física de QR y de códigos de barras todavía debe probarse con una webcam adecuada y un lector USB. La autorización se probó en el formulario manual, no durante un escaneo.
- La cuenta Gmail y la contraseña de aplicación están configuradas localmente en `apps/api/.env`, que está ignorado por Git. `verify()` y el envío de una invitación de prueba pasaron con Avast temporalmente desactivado; el residente recibió el mensaje y activó su cuenta. No se deshabilitó la validación TLS.
- Falta validar manualmente en navegador los flujos de residente y portería; no hay residencia ni personal disponibles para un piloto. La zona horaria oficial y las notificaciones siguen pendientes.
- El movimiento duplicado reportado ocurrió antes de las validaciones actuales y se resolvió con autorización del usuario; no hay una investigación pendiente salvo que vuelva a reproducirse.
- Falta validar en navegador los flujos de prerregistro y portería; no hay residencia ni personal disponibles para un piloto.
- Notificación al residente cuando su visita llega o cuando llega una encomienda.
- Evidencia fotográfica o firma en la entrega de encomiendas.
- Reportes específicos de encomiendas.
- Limpieza de `styles.css` (reglas duplicadas).
- Eliminar la función `createVehicle` anidada y sin uso dentro de `createAccess`.
- Optimizar el bundle del frontend con carga diferida de `@zxing` y generación de códigos.

## Punto de continuación recomendado

1. Validar en navegador los flujos de residente y portería; luego probarlos con vigilantes y administradores y conseguir un conjunto para piloto.
2. Definir la zona horaria oficial antes de operar en varias regiones y publicar bajo HTTPS antes de invitar residentes reales.
3. Definir notificaciones operativas y priorizar reportes con base en el piloto.
4. Probar QR, código de barras y autorización durante escaneo cuando se disponga del lector o cámara adecuados.

## Reglas de decisión actuales

- La cámara no se sigue ajustando por ahora.
- Los `accessCode` regenerados invalidaron los QR anteriores; las credenciales viejas deben reemplazarse.
- Las encomiendas no se eliminan: se cierran como `ENTREGADA` o `DEVUELTA`.
- El usuario que recibe o entrega una encomienda se toma del token, no del cuerpo de la petición.
- No se deben detener procesos ajenos al proyecto.
- **Git y pull requests:** no usar ni solicitar autenticación de GitKraken, ni invocar herramientas `GitKraken-*`. Este proyecto trabaja directamente con Git y GitHub; crear y revisar pull requests desde GitHub.
