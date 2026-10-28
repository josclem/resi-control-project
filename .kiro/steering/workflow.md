# Resi Control - Flujo de trabajo

## Antes de implementar

1. Leer este directorio `.kiro`.
2. Revisar [CONTEXTO_PROYECTO.md](C:/Users/klement/resi-control/CONTEXTO_PROYECTO.md) para el estado funcional y técnico.
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

## Estado actual (octubre 2026)

Completado y funcionando:

- Monorepo TypeScript con API Express, Prisma y frontend React/Vite.
- PostgreSQL local `resi_control` sincronizado.
- Login JWT con roles `SUPER_ADMINISTRADOR`, `ADMINISTRADOR` y `VIGILANTE`.
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
- `npm run build` pasa para API y frontend.

Pendiente o pausado:

- La webcam actual no lee de forma confiable QR mostrados en pantalla. Pausado.
- Movimiento duplicado de Jose Rojas: dos `ENTRADA` seguidas con modo `BLOCK`.
- App de residentes para pre-registrar visitas peatonales o vehiculares (solo anotada, no implementada).
- Notificación al residente cuando su visita llega o cuando llega una encomienda.
- Evidencia fotográfica o firma en la entrega de encomiendas.
- Reportes específicos de encomiendas.
- Administración de usuarios y roles desde la interfaz.
- Limpieza de `styles.css` (reglas duplicadas).
- Eliminar la función `createVehicle` anidada y sin uso dentro de `createAccess`.
- Optimizar el bundle del frontend con carga diferida de `@zxing` y generación de códigos.

## Punto de continuación recomendado

1. Revisar con el usuario el estado de las encomiendas y definir el canal de notificación al residente.
2. Investigar el movimiento duplicado de Jose Rojas antes de tocar la lógica de movimientos irregulares.
3. Limpiar CSS duplicado y código muerto sin alterar las grillas existentes.
4. Agregar reportes de encomiendas por fecha, tipo y estado.
5. Probar el escaneo con un lector USB o una cámara con autofoco.

## Reglas de decisión actuales

- La cámara no se sigue ajustando por ahora.
- Los `accessCode` regenerados invalidaron los QR anteriores; las credenciales viejas deben reemplazarse.
- Las encomiendas no se eliminan: se cierran como `ENTREGADA` o `DEVUELTA`.
- El usuario que recibe o entrega una encomienda se toma del token, no del cuerpo de la petición.
- No se deben detener procesos ajenos al proyecto.
