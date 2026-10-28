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

## Modelo inicial

Se separan residentes, visitantes y usuarios del sistema. Un residente o visitante puede tener múltiples registros de acceso. Cada registro conserva tipo de acceso, fecha/hora, nombre y apartamento. Las encomiendas se asocian a una persona y conservan tipo, estado, remitente, guía, fecha de recepción y datos de entrega. Los nombres de perfiles son datos de configuración del dominio y pueden cambiarse más adelante sin afectar el flujo.

La conexión con lectores de huella y puertas se implementará mediante un adaptador de dispositivo cuando se conozcan fabricante, protocolo, SDK y modo de instalación.

## Contexto y especificaciones

El contexto permanente del proyecto está en `.kiro/steering`. La especificación y el estado de implementación del MVP están en `.kiro/specs/access-control`. La especificación de encomiendas está en `.kiro/specs/encomiendas`.

## Enfoque de producto

El proyecto se desarrollará primero como un MVP operativo para portería, no como una plataforma gigante. La prioridad es validar con conjuntos reales que el login, el registro de residentes/visitantes, las entradas/salidas, las encomiendas y los reportes resuelven un problema suficientemente importante. La notificación al residente, la autorización móvil, la biometría y la integración con hardware de puertas quedan como fases posteriores sujetas a validación.
