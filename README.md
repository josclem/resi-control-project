# Resi Control

MVP para gestionar el acceso de residentes y visitantes de un conjunto residencial, incluyendo el control de encomiendas en portería.

## Stack

- **API:** Node.js, Express, TypeScript, Prisma y PostgreSQL.
- **Frontend:** React, Vite y TypeScript.
- **Autenticación:** JWT con perfiles `SUPER_ADMINISTRADOR`, `ADMINISTRADOR` y `VIGILANTE`.
- **Biometría:** preparada como integración posterior; el sistema guarda el identificador de la plantilla, no datos biométricos crudos.

## Inicio rápido

1. Instalar Node.js 20 o superior y PostgreSQL 16 o superior.
2. Ejecutar `npm install`.
3. Copiar `apps/api/.env.example` como `apps/api/.env` y completar `DATABASE_URL` y `JWT_SECRET`.
4. Ejecutar `npm run db:generate`, `npm run db:push` y `npm run db:seed`.
5. Iniciar con `npm run dev`.

Usuario inicial de desarrollo: `admin@resicontrol.local` / `Admin123!`. Debe cambiarse antes de usar el sistema en producción.

La API queda en `http://localhost:4000` y el frontend en `http://localhost:5173`.

## Pruebas automatizadas

Actualmente no hay suites de pruebas unitarias ni de integración configuradas; `npm run build` valida compilación y tipos, pero no sustituye pruebas de comportamiento. Incorporar pruebas automatizadas es el siguiente trabajo técnico prioritario antes de seguir ampliando funcionalidades.

- **Unitarias:** probar funciones puras y reglas de negocio pequeñas sin conectarse a la base de datos.
- **Integración:** probar rutas y persistencia de la API con PostgreSQL aislado para pruebas; nunca usar la base de desarrollo o producción.
- **Primeros flujos:** movimientos duplicados y autorización de supervisor; cierre de encomiendas y validación de quién recibe; validación de acceso por residencia y permisos.
- **Ejecución:** cada pull request debe pasar las pruebas y `npm run build`. Las pruebas de integración deben preparar y limpiar sus propios datos de forma repetible.
- **Diseño para probar:** separar la creación de la aplicación Express del arranque del servidor para poder probar la API sin abrir un puerto real.

El runner y las dependencias de pruebas se incorporarán en la rama dedicada a esta tarea, junto con scripts documentados para ejecutar las suites.

## Flujo de ramas

`main` es la rama principal y el punto de partida para el trabajo. Las funciones y correcciones se desarrollan y prueban en su propia rama; `production` se reserva para preparar exactamente el código que se publicará.

1. **Crear una rama de trabajo desde `main` actualizado.** Usa un nombre descriptivo, por ejemplo `feature/reportes-encomiendas` o `fix/duplicated-access-movement`.
2. **Desarrollar y probar en esa misma rama.** Haz commits pequeños y descriptivos. Corrige allí los problemas encontrados y repite las pruebas; no cambies de rama para continuar ese trabajo.
3. **Integrar en `main` cuando la rama esté validada.** Usa un pull request de la rama de trabajo a `main`. `main` contiene el trabajo integrado y probado, y sirve de base para las siguientes ramas.
4. **Preparar una publicación en `production` cuando se decida qué versión lanzar.** Crea o actualiza `production` desde el commit aprobado de `main` que se publicará. Esa rama representa el código candidato/de producción; allí se hacen las comprobaciones finales de publicación, no el desarrollo habitual.
5. Si la validación de una rama de trabajo falla, continúa corrigiendo y probando en esa rama. Si falla la validación de publicación, corrige el cambio en una rama de trabajo, intégralo en `main` tras validarlo y actualiza `production` con el código aprobado.

No trabajes directamente sobre `main` ni `production`. Mantén las ramas actualizadas con el remoto y no incluyas archivos locales, secretos ni artefactos generados en los commits. La rama `qa` existente es histórica y no forma parte del flujo actual.

## Modelo inicial

Se separan residentes, visitantes y usuarios del sistema. Un residente o visitante puede tener múltiples registros de acceso. Cada registro conserva tipo de acceso, fecha/hora, nombre y apartamento. Las encomiendas se asocian a una persona y conservan tipo, estado, remitente, guía, fecha de recepción y datos de entrega. Los nombres de perfiles son datos de configuración del dominio y pueden cambiarse más adelante sin afectar el flujo.

La conexión con lectores de huella y puertas se implementará mediante un adaptador de dispositivo cuando se conozcan fabricante, protocolo, SDK y modo de instalación.

## Contexto y especificaciones

El contexto permanente del proyecto está en `.kiro/steering`. La especificación y el estado de implementación del MVP están en `.kiro/specs/access-control`. La especificación de encomiendas está en `.kiro/specs/encomiendas`.

## Enfoque de producto

El proyecto se desarrollará primero como un MVP operativo para portería, no como una plataforma gigante. La prioridad es validar con conjuntos reales que el login, el registro de residentes/visitantes, las entradas/salidas, las encomiendas y los reportes resuelven un problema suficientemente importante. La notificación al residente, la autorización móvil, la biometría y la integración con hardware de puertas quedan como fases posteriores sujetas a validación.
