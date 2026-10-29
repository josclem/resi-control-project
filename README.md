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

## Flujo de ramas

Usa este flujo para que `main` conserve únicamente cambios probados:

1. **Crear una rama de trabajo** desde la última versión de `qa`. Usa nombres descriptivos, por ejemplo `feature/reportes-encomiendas` o `fix/duplicated-access-movement`.
2. **Desarrollar y validar** el cambio en esa rama. Ejecuta las comprobaciones pertinentes y haz commits pequeños y descriptivos.
3. **Integrar en `qa`** mediante un pull request desde la rama de trabajo. Publica/despliega `qa` y prueba allí el comportamiento antes de promoverlo.
4. **Promover a `main`** mediante un pull request de `qa` a `main`, solo después de confirmar que las pruebas y la validación funcional en `qa` fueron satisfactorias.
5. Si se encuentran problemas en `qa`, corrígelos en una rama de trabajo y vuelve a integrarlos en `qa`; no promociones a `main` hasta que estén resueltos.

No trabajes directamente sobre `main` ni `qa`. Mantén las ramas actualizadas con el remoto y no incluyas archivos locales, secretos ni artefactos generados en los commits.

## Modelo inicial

Se separan residentes, visitantes y usuarios del sistema. Un residente o visitante puede tener múltiples registros de acceso. Cada registro conserva tipo de acceso, fecha/hora, nombre y apartamento. Las encomiendas se asocian a una persona y conservan tipo, estado, remitente, guía, fecha de recepción y datos de entrega. Los nombres de perfiles son datos de configuración del dominio y pueden cambiarse más adelante sin afectar el flujo.

La conexión con lectores de huella y puertas se implementará mediante un adaptador de dispositivo cuando se conozcan fabricante, protocolo, SDK y modo de instalación.

## Contexto y especificaciones

El contexto permanente del proyecto está en `.kiro/steering`. La especificación y el estado de implementación del MVP están en `.kiro/specs/access-control`. La especificación de encomiendas está en `.kiro/specs/encomiendas`.

## Enfoque de producto

El proyecto se desarrollará primero como un MVP operativo para portería, no como una plataforma gigante. La prioridad es validar con conjuntos reales que el login, el registro de residentes/visitantes, las entradas/salidas, las encomiendas y los reportes resuelven un problema suficientemente importante. La notificación al residente, la autorización móvil, la biometría y la integración con hardware de puertas quedan como fases posteriores sujetas a validación.
